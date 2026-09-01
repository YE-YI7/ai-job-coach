jest.mock("server-only", () => ({}), { virtual: true });

import { TokenPayError } from "./tokenpay";
import { tokenPayRecoveryResponse } from "./tokenpay-recovery";

describe("TokenDance recovery responses", () => {
  it("preserves the recovery action in both JSON and the response header", async () => {
    const response = tokenPayRecoveryResponse(new TokenPayError("余额不足", 402, "top_up_balance"));
    expect(response?.status).toBe(402);
    expect(response?.headers.get("TokenDance-Recovery-Action")).toBe("top_up_balance");
    await expect(response?.json()).resolves.toMatchObject({ ok: false, recoveryAction: "top_up_balance" });
  });

  it("leaves unrelated errors to the route's normal handler", () => {
    expect(tokenPayRecoveryResponse(new Error("network"))).toBeNull();
  });
});
