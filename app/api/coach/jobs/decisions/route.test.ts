import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listJobDecisions, saveJobDecision } from "@/lib/coach-harness/repository";
jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository");

/**
 * 决定接口的红线有两条：`user_id` 只从登录态取（请求正文里写别人的 id 不生效），
 * 以及「保存成功」必须有服务端给出的那条决定撑着——存不下就说存不下。
 */
const RUN = "3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";
const V = "a".repeat(64);
const body = {
  jobId: "job-07", url: "https://boards.example.com/jobs/product-07", company: "示例科技",
  title: "产品实习生", location: "上海", decision: "verify", reason: "在招状态要确认",
  batchRunId: RUN, materialsVersion: V, requestId:RUN,expectedClaimId:null,
};
const request = (payload: unknown) => new Request("http://localhost/api/coach/jobs/decisions", {
  method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload),
});
const saved = { ...body, claimId: "claim-new", savedAt: "2026-10-08T02:00:00.000Z" };

beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "owner" });
  (listJobDecisions as jest.Mock).mockResolvedValue([]);
  (saveJobDecision as jest.Mock).mockResolvedValue(saved);
});

test("未登录既读不到别人的决定，也存不进决定", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(request(body))).status).toBe(401);
  expect(listJobDecisions).not.toHaveBeenCalled();
  expect(saveJobDecision).not.toHaveBeenCalled();
});

test("正文里塞别人的 user_id 也不会写到他名下", async () => {
  const response = await POST(request({ ...body, user_id: "someone-else", userId: "someone-else" }));
  expect(response.status).toBe(200);
  expect(saveJobDecision).toHaveBeenCalledWith("owner", expect.objectContaining({ jobId: "job-07" }),{requestId:RUN,expectedClaimId:null});
  const [, input] = (saveJobDecision as jest.Mock).mock.calls[0];
  expect(input).not.toHaveProperty("user_id");
  expect(input).not.toHaveProperty("userId");
});

test("读回来的决定只带本人那份，且不许被缓存", async () => {
  (listJobDecisions as jest.Mock).mockResolvedValue([saved]);
  const response = await GET();
  expect((await response.json())).toEqual({ ok: true, decisions: [saved] });
  expect(listJobDecisions).toHaveBeenCalledWith("owner");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

test("校验不过一条都不写，并把缺哪一项说清楚", async () => {
  for (const payload of [{ ...body, batchRunId: "run-1" }, { ...body, decision: "已投递" }, { ...body, url: "" }, "{" ] as unknown[]) {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  }
  expect(saveJobDecision).not.toHaveBeenCalled();
});

test("保存失败不许报成功：回「你之前的选择还在」", async () => {
  (saveJobDecision as jest.Mock).mockRejectedValue(Error("db down"));
  const response = await POST(request(body));
  expect(response.status).toBe(503);
  expect((await response.json())).toEqual({ ok: false, error: "决定没有保存，你之前的选择还在" });
});

test("读取失败不回空列表，免得界面说「你还没表过态」", async () => {
  (listJobDecisions as jest.Mock).mockRejectedValue(Error("db down"));
  const response = await GET();
  expect(response.status).toBe(500);
  expect((await response.json())).toEqual({ ok: false, error: "决定读取失败，本次没有改动" });
});

test("回给界面的是服务端那条，含真实 claim id", async () => {
  const response = await POST(request(body));
  expect((await response.json())).toEqual({ ok: true, decision: saved });
});
