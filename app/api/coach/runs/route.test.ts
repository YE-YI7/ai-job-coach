import { GET } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listActiveRuns, reconcileStaleTasks } from "@/lib/coach-harness/run-ledger";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/run-ledger", () => ({
  listActiveRuns: jest.fn(),
  reconcileStaleTasks: jest.fn(),
}));
jest.mock("@/lib/coach-harness/repository", () => ({
  createCoachRun: jest.fn(),
  getContextBundleForUser: jest.fn(),
}));

const USER = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
  (listActiveRuns as jest.Mock).mockResolvedValue([]);
  (reconcileStaleTasks as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/coach/runs?scope=active（FR-35 进度托盘订阅）", () => {
  test("未登录不查库", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/coach/runs?scope=active"))).status).toBe(401);
    expect(listActiveRuns).not.toHaveBeenCalled();
  });

  test("读之前先把陈旧行收口：断掉的行不能一直显示成「跑中」", async () => {
    (listActiveRuns as jest.Mock).mockResolvedValue([{ id: "run-1", goal: "找 20 个 agent 产品岗", status: "running", stopped_reason: null, updated_at: "", created_at: "" }]);
    const response = await GET(new Request("http://localhost/api/coach/runs?scope=active"));
    expect(response.status).toBe(200);
    expect(reconcileStaleTasks).toHaveBeenCalledWith({ userId: USER });
    expect((await response.json()).runs[0].status).toBe("running");
    // 收口必须发生在列表读取之前，否则这一轮还是把死行当活行报给界面。
    expect((reconcileStaleTasks as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((listActiveRuns as jest.Mock).mock.invocationCallOrder[0]);
  });

  test("只支持 active 这一档 scope，其它值 400 而不是默默返回全部", async () => {
    const response = await GET(new Request("http://localhost/api/coach/runs?scope=all"));
    expect(response.status).toBe(400);
    expect(listActiveRuns).not.toHaveBeenCalled();
  });

  test("库读失败如实报错，不返回一个看起来正常的空列表", async () => {
    (listActiveRuns as jest.Mock).mockRejectedValue(new Error("boom"));
    const response = await GET(new Request("http://localhost/api/coach/runs?scope=active"));
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
