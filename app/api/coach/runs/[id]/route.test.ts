import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { cancelTask } from "@/lib/coach-harness/run-ledger";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/run-ledger", () => ({ cancelTask: jest.fn() }));

const USER = "00000000-0000-4000-8000-000000000001";
const RUN = "33333333-3333-4333-8333-333333333333";

function request(body: unknown) {
  return new Request(`http://localhost/api/coach/runs/${RUN}`, { method: "POST", body: JSON.stringify(body) });
}

function call(body: unknown, id = RUN) {
  return POST(request(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
});

describe("POST /api/coach/runs/{id} {action:'cancel'}（FR-35 取消入口）", () => {
  test("取消由 run-ledger 的状态机负责，路由只带 userId 与 reason", async () => {
    (cancelTask as jest.Mock).mockResolvedValue({ status: "cancelled" });
    const response = await call({ action: "cancel" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, runId: RUN, status: "cancelled" });
    expect(cancelTask).toHaveBeenCalledWith({ userId: USER, runId: RUN, reason: "user_cancelled" });
  });

  test("本轮只开通 cancel：其它动作 400，不碰状态机", async () => {
    expect((await call({ action: "retry" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(cancelTask).not.toHaveBeenCalled();
  });

  test("畸形 id 是 400，不是打给库之后回来一个 500", async () => {
    const response = await call({ action: "cancel" }, "not-a-uuid");
    expect(response.status).toBe(400);
    expect(cancelTask).not.toHaveBeenCalled();
  });

  test("查不到的任务是 404；其它异常如实说「没保存」，界面保持原状态", async () => {
    (cancelTask as jest.Mock).mockRejectedValueOnce(new Error("任务不存在"));
    expect((await call({ action: "cancel" })).status).toBe(404);

    (cancelTask as jest.Mock).mockRejectedValueOnce(new Error("connection reset"));
    const broken = await call({ action: "cancel" });
    expect(broken.status).toBe(500);
    expect((await broken.json()).ok).toBe(false);
  });
});
