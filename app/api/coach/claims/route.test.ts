import { PATCH } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { confirmClaim, withdrawClaim } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
// assertUuid 用真的：它是一段纯字符串校验，替身会让「无效 id → 400」这条测不到。
jest.mock("@/lib/coach-harness/repository", () => ({
  ...jest.requireActual("@/lib/coach-harness/repository"),
  confirmClaim: jest.fn(),
  withdrawClaim: jest.fn(),
}));

const USER = "00000000-0000-4000-8000-000000000001";
const CLAIM = "22222222-2222-4222-8222-222222222222";

function request(body: unknown) {
  return new Request("http://localhost/api/coach/claims", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
});

describe("PATCH /api/coach/claims（FR-4 批量核对的服务端落点）", () => {
  test("未登录不碰库", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
    const response = await PATCH(request({ claimId: CLAIM, action: "confirm" }));
    expect(response.status).toBe(401);
    expect(confirmClaim).not.toHaveBeenCalled();
  });

  test("确认走 confirmClaim，撤回走 withdrawClaim，两个动作不相交", async () => {
    (confirmClaim as jest.Mock).mockResolvedValue({ id: CLAIM, status: "confirmed" });
    (withdrawClaim as jest.Mock).mockResolvedValue({ id: CLAIM, status: "withdrawn" });

    const confirmed = await PATCH(request({ claimId: CLAIM, action: "confirm" }));
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).claim.status).toBe("confirmed");
    expect(confirmClaim).toHaveBeenCalledWith(USER, CLAIM);

    const withdrawn = await PATCH(request({ claimId: CLAIM, action: "withdraw" }));
    expect(withdrawn.status).toBe(200);
    expect((await withdrawn.json()).ok).toBe(true);
    expect(withdrawClaim).toHaveBeenCalledWith(USER, CLAIM, "user_review");
  });

  test("白名单外的动作与畸形 id 都是 400，不落库", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    expect((await PATCH(request({ claimId: CLAIM, action: "edit_text" }))).status).toBe(400);
    expect((await PATCH(request({ claimId: "not-a-uuid", action: "confirm" }))).status).toBe(400);
    expect(confirmClaim).not.toHaveBeenCalled();
    expect(withdrawClaim).not.toHaveBeenCalled();
  });

  test("别人的/已不存在的 claim 是 404，其余异常如实 500 且不假装成功", async () => {
    (confirmClaim as jest.Mock).mockRejectedValueOnce(new Error("事实不存在"));
    const missing = await PATCH(request({ claimId: CLAIM, action: "confirm" }));
    expect(missing.status).toBe(404);

    (confirmClaim as jest.Mock).mockRejectedValueOnce(new Error("connection reset"));
    const broken = await PATCH(request({ claimId: CLAIM, action: "confirm" }));
    expect(broken.status).toBe(500);
    expect((await broken.json()).ok).toBe(false);
  });
});
