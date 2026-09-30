import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { listCockpitOpportunities, readUserTierPreference } from "@/lib/coach-harness/repository";
import { searchLiveJobs } from "@/lib/jobs/live-sources";
import { cancelTask, getTaskLedger } from "@/lib/coach-harness/run-ledger";
import { FakeDb } from "@/lib/coach-harness/run-ledger/testing/fake-db";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
jest.mock("@/lib/coach-harness/repository", () => ({ ...jest.requireActual("@/lib/coach-harness/repository"), listCockpitOpportunities: jest.fn(), readUserTierPreference: jest.fn() }));
jest.mock("@/lib/jobs/live-sources", () => ({ ...jest.requireActual("@/lib/jobs/live-sources"), searchLiveJobs: jest.fn() }));
const owner = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const request = () => new Request("http://localhost/api/coach/jobs/discover", { method: "POST", body: JSON.stringify({ profileId, requestId }) });
const online = { postings: [], failures: [], calls: 2, truncatedCalls: 0 };
let db: FakeDb;
beforeEach(() => {
  jest.resetAllMocks(); db = new FakeDb();
  (getDbClient as jest.Mock).mockResolvedValue(db);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: owner });
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{ id: profileId, workspaceType: "preparation", role: "产品经理", location: "上海", resumeText: "2年经验，SQL" }]);
  (readUserTierPreference as jest.Mock).mockResolvedValue({ effectiveTiers: [], origin: "unset", pending: null });
  (searchLiveJobs as jest.Mock).mockResolvedValue(online);
});
test("真实 route→repository→ledger：保存后返回，回来可读，重试不重复搜索", async () => {
  const first = await POST(request()); expect(first.status).toBe(200);
  const body = await first.json();
  const ledger = await getTaskLedger({ userId: owner, runId: body.runId });
  expect(ledger).toMatchObject({ status: "done", result: body, steps: [{ status: "done" }, { status: "done" }] });
  expect(db.rows("product_events")).toContainEqual(expect.objectContaining({ event_name: "agent_job_search_completed", user_id: owner }));
  const second = await (await POST(request())).json();
  expect(second).toEqual(body);
  expect(searchLiveJobs).toHaveBeenCalledTimes(1);
  const restored = await GET(new Request(`http://localhost/api/coach/jobs/discover?profileId=${profileId}`));
  expect(await restored.json()).toMatchObject({ found: true, result: body });
  expect(searchLiveJobs).toHaveBeenCalledTimes(1);
  await expect(getTaskLedger({ userId: "another", runId: body.runId })).rejects.toThrow("任务不存在");
});
test("简历或偏好已改变时不复用旧推荐", async () => {
  await POST(request());
  (readUserTierPreference as jest.Mock).mockResolvedValue({ effectiveTiers: ["startup"], origin: "explicit" });
  const response = await GET(new Request(`http://localhost/api/coach/jobs/discover?profileId=${profileId}`));
  expect(await response.json()).toMatchObject({ found: false });
});
test("搜索期间取消，返回的结果不会复活任务", async () => {
  (searchLiveJobs as jest.Mock).mockImplementation(async () => {
    await cancelTask({ userId: owner, runId: String(db.rows("coach_runs")[0].id) });
    return online;
  });
  expect((await POST(request())).status).toBe(409);
  expect(db.rows("coach_runs")[0]).toMatchObject({ status: "cancelled" });
  expect(db.rows("coach_runs")[0].output).toBeUndefined();
});
test("源故障会留下可查的失败任务，绝不伪造空列表成功", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue({ ...online, calls: 1, failures: [{ source: "remoteok", keyword: "product manager" }] });
  const response = await POST(request()); expect(response.status).toBe(502);
  const body = await response.json();
  expect(await getTaskLedger({ userId: owner, runId: body.runId })).toMatchObject({ status: "failed", result: null });
});
