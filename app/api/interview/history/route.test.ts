import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { readInterviewHistory, recordInterviewProgress } from "@/lib/interview/history-store";
jest.mock("@/lib/auth"); jest.mock("@/lib/interview/history-store");
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  jest.resetAllMocks(); jest.mocked(getCurrentUserFromRequest).mockResolvedValue({ id: "owner" });
  jest.mocked(readInterviewHistory).mockResolvedValue({ sessions: [], total: 0, page: 1, pageSize: 10 });
  jest.mocked(recordInterviewProgress).mockResolvedValue(true);
});
const get = (query = "") => GET(new Request(`https://example.com/api/interview/history?${query}`));
const post = (body: unknown) => POST(new Request("https://example.com/api/interview/history", { method: "POST", body: JSON.stringify(body) }));
test("unauthenticated history and progress writes are rejected before database access", async () => {
  jest.mocked(getCurrentUserFromRequest).mockResolvedValue(null);
  expect((await get()).status).toBe(401); expect((await post({})).status).toBe(401);
  expect(readInterviewHistory).not.toHaveBeenCalled(); expect(recordInterviewProgress).not.toHaveBeenCalled();
});
test("caller user ID cannot override authenticated owner; pagination and filters passed exactly", async () => {
  const result = await get(`userId=foreign&opportunityId=${id}&q=原话&round=二面&page=3`);
  expect(result.status).toBe(200);
  expect(readInterviewHistory).toHaveBeenCalledWith("owner", { opportunityId: id, sessionId: undefined,
    query: "原话", round: "二面", page: 3 });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
test.each(["page=0", "page=-1", "page=1.2", "page=Infinity", "sessionId=invalid", `q=${"x".repeat(81)}`])("rejects malformed filters %s", async query => {
  expect((await get(query)).status).toBe(400); expect(readInterviewHistory).not.toHaveBeenCalled();
});
test("foreign or missing detail gives indistinguishable 404", async () => {
  expect((await get(`sessionId=${id}`)).status).toBe(404);
});
test("owner progress only forwards allowed fields, never text supplied by caller", async () => {
  expect((await post({ userId: "foreign", sessionId: id, action: "seen", questionId: id, answer: "不要落库" })).status).toBe(200);
  expect(recordInterviewProgress).toHaveBeenCalledWith("owner", id, { action: "seen", questionId: id });
});
test("cannot save state for another owner or foreign question", async () => {
  jest.mocked(recordInterviewProgress).mockResolvedValue(false);
  expect((await post({ sessionId: id, action: "seen", questionId: id })).status).toBe(404);
});
test("failed end write is visible, never a fake saved response", async () => {
  jest.mocked(recordInterviewProgress).mockRejectedValue(Error("db down"));
  const response = await post({ sessionId: id, action: "end" });
  expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("saved");
});
