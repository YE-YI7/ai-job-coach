import { getDbClient } from "./db";
import { hasActiveTokenPayConnection } from "./tokenpay";
import { checkQuota, finalizeQuota, reserveQuota, reserveFirstCoachingQuota } from "./quota";

jest.mock("./db", () => ({ getDbClient: jest.fn() }));
jest.mock("./tokenpay", () => ({ hasActiveTokenPayConnection: jest.fn() }));

const mockDb = getDbClient as jest.MockedFunction<typeof getDbClient>;
const mockHasTokenPay = hasActiveTokenPayConnection as jest.MockedFunction<typeof hasActiveTokenPayConnection>;

describe("TokenPay quota source", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasTokenPay.mockResolvedValue(true);
  });

  it("bypasses hosted quota reservations for connected users", async () => {
    const reservation = await reserveQuota("user-1", "chat", "request-1");
    expect(reservation).toEqual({ id: "tokenpay-request-1", source: "tokenpay", remaining: null });
    expect(mockDb).not.toHaveBeenCalled();
    await expect(finalizeQuota(reservation, true)).resolves.toBe(true);
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("reports TokenPay as the available billing source", async () => {
    await expect(checkQuota("user-1", "resume")).resolves.toEqual({
      allowed: true,
      remaining: null,
      source: "tokenpay",
    });
    expect(mockDb).not.toHaveBeenCalled();
  });
});

describe("first coaching fallback", () => {
  beforeEach(() => jest.resetAllMocks());
  it("fails closed without database", async () => {
    mockDb.mockResolvedValue(null);
    await expect(reserveFirstCoachingQuota("user-1")).resolves.toBeNull();
  });
  it("returns null when the lifetime grant is unavailable", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockDb.mockResolvedValue({ rpc } as never);
    await expect(reserveFirstCoachingQuota("user-1")).resolves.toBeNull();
  });
  it("uses the isolated RPC for reservation and refund", async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: "grant-id", error: null }).mockResolvedValueOnce({ data: true, error: null });
    mockDb.mockResolvedValue({ rpc } as never);
    const reservation = await reserveFirstCoachingQuota("user-1");
    expect(reservation?.source).toBe("first_coaching");
    await expect(finalizeQuota(reservation, false)).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_first_guidance", { p_user_id: "user-1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_first_guidance", { p_reservation_id: "grant-id", p_success: false });
  });
  it("does not grant a free turn on a database error", async () => {
    mockDb.mockResolvedValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("offline") }) } as never);
    await expect(reserveFirstCoachingQuota("user-1")).rejects.toThrow("offline");
  });
});
