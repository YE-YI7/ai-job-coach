import { GET } from "./route";
import { getDbClient } from "@/lib/db";
import { evalAdminAccess } from "@/lib/coach-harness/eval-admin-http";
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
jest.mock("@/lib/coach-harness/eval-admin-http", () => ({ evalAdminAccess: jest.fn(), evalJson: (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }) }));
const userId = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { jest.clearAllMocks(); });
test.each([401,403])("private I/O stops before DB on %s", async status => {
  (evalAdminAccess as jest.Mock).mockResolvedValue({ error: Response.json({ error: "forbidden" }, { status }) });
  expect((await GET(new Request(`https://example.test/api/admin/companion-traces?userId=${userId}&requestId=${requestId}`))).status).toBe(status);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("exact owner and request bind private actual I/O; absent old fields stay null", async () => {
  (evalAdminAccess as jest.Mock).mockResolvedValue({ user: { id: "admin" }, error: null });
  const q = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValueOnce({ data: { id: "turn", user_id: userId, request_id: requestId, question: "原始问题", answer: "导师回答", learning_trace: { companion: { planId: userId, version: 2, submissionId: null }, compiledPrompt: "Bearer fictional-only-marker", model: "fixture-model" } } }).mockResolvedValueOnce({ data: null }) };
  (getDbClient as jest.Mock).mockResolvedValue({ from: () => q });
  const response = await GET(new Request(`https://example.test/api/admin/companion-traces?userId=${userId}&requestId=${requestId}`));
  const body = await response.json();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(q.eq).toHaveBeenCalledWith("user_id", userId); expect(q.eq).toHaveBeenCalledWith("request_id", requestId);
  expect(body.trace).toMatchObject({ input: "原始问题", output: "导师回答", system: null, modelOutput: null, currentPlan: null });
  expect(JSON.stringify(body)).not.toContain("fictional-only-marker");
});
