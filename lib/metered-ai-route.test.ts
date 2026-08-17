import { getCurrentUserFromRequest } from "./auth";
import { finalizeQuota, reserveQuota } from "./quota";
import { withMeteredAiRoute } from "./metered-ai-route";

jest.mock("./auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("./quota", () => ({ reserveQuota: jest.fn(), finalizeQuota: jest.fn() }));
jest.mock("./generation-context", () => ({
  runWithGenerationContext: jest.fn((_context, callback) => callback()),
}));

const mockAuth = getCurrentUserFromRequest as jest.MockedFunction<typeof getCurrentUserFromRequest>;
const mockReserve = reserveQuota as jest.MockedFunction<typeof reserveQuota>;
const mockFinalize = finalizeQuota as jest.MockedFunction<typeof finalizeQuota>;

describe("metered AI route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    mockReserve.mockResolvedValue({ id: "reservation-1", source: "free_chat_daily", remaining: 2 });
    mockFinalize.mockResolvedValue(true);
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
});
