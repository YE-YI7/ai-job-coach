import { getDbClient } from "./db";
import { hasActiveTokenPayConnection } from "./tokenpay";
import { checkQuota, finalizeQuota, reserveQuota, reserveFirstCoachingQuota } from "./quota";

jest.mock("./db", () => ({ getDbClient: jest.fn() }));
jest.mock("./tokenpay", () => ({ hasActiveTokenPayConnection: jest.fn() }));
jest.mock("./watcha-wallet", () => ({ hasWatchaOperation: jest.fn().mockResolvedValue(false), reserveWatchaPoint: jest.fn(), getWatchaPointBalance: jest.fn().mockResolvedValue(0) }));
import { reserveWatchaPoint } from './watcha-wallet';

const mockDb = getDbClient as jest.MockedFunction<typeof getDbClient>;
const mockHasTokenPay = hasActiveTokenPayConnection as jest.MockedFunction<typeof hasActiveTokenPayConnection>;

describe('Watcha points', () => {
  beforeEach(() => { jest.clearAllMocks(); mockHasTokenPay.mockResolvedValue(false); });
  it('falls back only when hosted quota is exhausted', async () => {
    mockDb.mockResolvedValue({rpc:jest.fn().mockResolvedValue({data:[{allowed:false,reservation_id:null}],error:null})} as never);
    jest.mocked(reserveWatchaPoint).mockResolvedValue({id:'watcha:r1',source:'watcha',remaining:9});
    expect((await reserveQuota('user','chat','request-123'))?.source).toBe('watcha');
    expect(reserveWatchaPoint).toHaveBeenCalledWith('user','chat:request-123');
  });
  it('rejects replay rather than charging a second source', async () => {
    mockDb.mockResolvedValue({rpc:jest.fn().mockResolvedValue({data:[{allowed:false,reservation_id:'existing'}],error:null})} as never);
    expect(await reserveQuota('user','chat','request-123')).toBeNull();
    expect(reserveWatchaPoint).not.toHaveBeenCalled();
  });
  it('refunds the paid reservation atomically using its ledger ID', async () => {
    const rpc=jest.fn().mockResolvedValue({data:true,error:null});mockDb.mockResolvedValue({rpc} as never);
    expect(await finalizeQuota({id:'watcha:r1',source:'watcha',remaining:9},false)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('finalize_watcha_point',{p_reservation_id:'r1',p_success:false});
  });
});

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
    await expect(reserveFirstCoachingQuota("user-1", "session", "request")).resolves.toBeNull();
  });
  it("returns null when the lifetime grant is unavailable", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockDb.mockResolvedValue({ rpc } as never);
    await expect(reserveFirstCoachingQuota("user-1", "session", "request")).resolves.toBeNull();
  });
  it("uses the isolated RPC for reservation and refund", async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: [{reservation_id:"grant-id",remaining:1,replay:false}], error: null }).mockResolvedValueOnce({ data: true, error: null });
    mockDb.mockResolvedValue({ rpc } as never);
    const reservation = await reserveFirstCoachingQuota("user-1", "session", "request");
    expect(reservation?.source).toBe("first_coaching");
    await expect(finalizeQuota(reservation, false)).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_learning_guidance", { p_user_id: "user-1", p_session_id: "session", p_request_id: "request" });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_learning_guidance", { p_reservation_id: "grant-id", p_success: false });
  });
  it("does not grant a free turn on a database error", async () => {
    mockDb.mockResolvedValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("offline") }) } as never);
    await expect(reserveFirstCoachingQuota("user-1", "session", "request")).rejects.toThrow("offline");
  });
  it("replayed saved response doesn't increment the grant again", async () => {
    const rpc = jest.fn().mockResolvedValue({data:[{reservation_id:"saved",remaining:0,replay:true}],error:null});
    mockDb.mockResolvedValue({rpc} as never);
    const reservation = await reserveFirstCoachingQuota("user", "session", "request");
    expect(reservation?.source).toBe("first_coaching_replay");
    await expect(finalizeQuota(reservation,true)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
