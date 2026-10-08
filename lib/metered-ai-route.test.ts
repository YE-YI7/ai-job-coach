jest.mock("server-only", () => ({}), { virtual: true });

import { getCurrentUserFromRequest } from "./auth";
import { finalizeQuota, reserveQuota, reserveFirstCoachingQuota } from "./quota";
import { withMeteredAiRoute } from "./metered-ai-route";

jest.mock("./auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("./quota", () => ({ reserveQuota: jest.fn(), reserveFirstCoachingQuota: jest.fn(), finalizeQuota: jest.fn() }));
jest.mock("./tokenpay", () => ({ hasActiveTokenPayConnection: jest.fn().mockResolvedValue(false) }));
jest.mock("./generation-context", () => ({
  runWithGenerationContext: jest.fn((_context, callback) => callback()),
}));

const mockAuth = getCurrentUserFromRequest as jest.MockedFunction<typeof getCurrentUserFromRequest>;
const mockReserve = reserveQuota as jest.MockedFunction<typeof reserveQuota>;
const mockFinalize = finalizeQuota as jest.MockedFunction<typeof finalizeQuota>;
const boundRequest = () => new Request("https://example.com", {method:"POST",body:JSON.stringify({sessionId:"22222222-2222-4222-8222-222222222222",requestId:"33333333-3333-4333-8333-333333333333"})});

describe("metered AI route", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks also clears the generation-context implementation.
    jest.requireMock("./generation-context").runWithGenerationContext.mockImplementation((_context: unknown, callback: () => unknown) => callback());
    mockAuth.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    mockReserve.mockResolvedValue({ id: "reservation-1", source: "free_chat_daily", remaining: 2 });
    mockFinalize.mockResolvedValue(true);
    (reserveFirstCoachingQuota as jest.Mock).mockResolvedValue(null);
  });

  it("commits one reservation for a successful response", async () => {
    const handler = jest.fn(async () => Response.json({ ok: true }));
    const route = withMeteredAiRoute(handler, { operation: "test_generation", quotaType: "chat" });
    const response = await route(new Request("https://example.com/api/test", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({ id: "reservation-1" }), true);
    expect(response.headers.get("x-yi-zhi-quota-remaining")).toBe("2");
  });

  it("refunds the reservation when the route returns an error", async () => {
    const route = withMeteredAiRoute(
      async () => Response.json({ ok: false }, { status: 422 }),
      { operation: "test_generation", quotaType: "resume" },
    );
    await route(new Request("https://example.com/api/test", { method: "POST" }));

    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({ id: "reservation-1" }), false);
  });

  it("does not execute the handler when quota is unavailable", async () => {
    mockReserve.mockResolvedValue(null);
    const handler = jest.fn(async () => Response.json({ ok: true }));
    const route = withMeteredAiRoute(handler, { operation: "test_generation", quotaType: "interview" });
    const response = await route(new Request("https://example.com/api/test", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("protects first mentor reply when normal quota is exhausted", async () => {
    mockReserve.mockResolvedValue(null);
    (reserveFirstCoachingQuota as jest.Mock).mockResolvedValue({ id: "first-coach:grant", source: "first_coaching", remaining: 0 });
    const response = await withMeteredAiRoute(async () => Response.json({ ok: true }), { operation: "cockpit_agent", quotaType: "chat", firstCoaching: true })(boundRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yi-zhi-quota-source")).toBe("first_coaching");
    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({ id: "first-coach:grant" }), true);
  });

  it("cannot use the first mentor grant for discovery or import even with the flag", async () => {
    mockReserve.mockResolvedValue(null);
    const response = await withMeteredAiRoute(async () => Response.json({ ok: true }), { operation: "job_discovery", quotaType: "chat", firstCoaching: true })(new Request("https://example.com"));
    expect(response.status).toBe(403);
    expect(reserveFirstCoachingQuota).not.toHaveBeenCalled();
  });

  it("does not take the grant while ordinary or paid quota is available", async () => {
    await withMeteredAiRoute(async () => Response.json({ ok: true }), { operation: "cockpit_agent", quotaType: "chat", firstCoaching: true })(new Request("https://example.com"));
    expect(reserveFirstCoachingQuota).not.toHaveBeenCalled();
  });

  it("refunds a protected turn on a failed response", async () => {
    mockReserve.mockResolvedValue(null);
    (reserveFirstCoachingQuota as jest.Mock).mockResolvedValue({ id: "first-coach:grant", source: "first_coaching", remaining: 0 });
    await withMeteredAiRoute(async () => Response.json({ ok: false }, { status: 422 }), { operation: "cockpit_agent", quotaType: "chat", firstCoaching: true })(boundRequest());
    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({ id: "first-coach:grant" }), false);
  });
  it("cannot claim protected feedback without a valid session and request binding", async () => {
    mockReserve.mockResolvedValue(null);
    const response = await withMeteredAiRoute(async () => Response.json({ok:true}),{operation:"cockpit_agent",quotaType:"chat",firstCoaching:true})(new Request("https://example.com"));
    expect(response.status).toBe(403);expect(reserveFirstCoachingQuota).not.toHaveBeenCalled();
  });
});
