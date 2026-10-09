jest.mock("@/lib/auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("@/lib/watcha-pay", () => ({ getWatchaPayAccess: jest.fn(), WatchaPayError: class extends Error {} }));
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getWatchaPayAccess } from "@/lib/watcha-pay";
import { POST } from "./route";
const auth = jest.mocked(getCurrentUserFromRequest);
const access = jest.mocked(getWatchaPayAccess);
function request(body: unknown) { return new Request("https://www.ai-job-coach.xin/api/payments/watcha/access", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue({ id: "authenticated-user" }); });
it("requires authentication", async () => {
  auth.mockResolvedValue(null);
  const response = await POST(request({ capability: "chat" }));
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(access).not.toHaveBeenCalled();
});
it.each([{ capability: "unknown" }, { capability: "chat", user_id: "victim" }, { capability: "chat", amount: 1 }, [], null])("rejects identity injection and invalid body %#", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(access).not.toHaveBeenCalled();
});
it("uses only the authenticated identity", async () => {
  access.mockResolvedValue({ configured: false, channel: "alipay" });
  const response = await POST(request({ capability: "chat" }));
  expect(response.status).toBe(200);
  expect(access).toHaveBeenCalledWith("authenticated-user", "chat");
  expect(await response.json()).toEqual({ ok: true, account: { configured: false, channel: "alipay" } });
});
it("does not leak upstream errors", async () => {
  access.mockRejectedValue(new Error("secret credential"));
  const response = await POST(request({ capability: "resume" }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret credential");
});
