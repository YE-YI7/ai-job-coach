import { getDbClient } from "./db";
import { hasActiveTokenPayConnection } from "./tokenpay";
import { checkQuota, finalizeQuota, reserveQuota } from "./quota";

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
