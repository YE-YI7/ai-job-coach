import { GET } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import {
  readAnalyticsSummary,
  readAnalyticsDetail,
} from "@/lib/admin-analytics-store";
jest.mock("@/lib/auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
jest.mock("@/lib/admin-analytics-store", () => ({
  DETAIL_KINDS: [
    "turns",
    "resumeChat",
    "legacyChat",
    "opportunities",
    "material",
  ],
  readAnalyticsSummary: jest.fn(),
  readAnalyticsDetail: jest.fn(),
}));
const origin = "https://example.invalid/api/admin/analytics",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const old = process.env.ADMIN_EMAILS;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_EMAILS = "owner@example.invalid";
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({
    id,
    email: "owner@example.invalid",
  });
  (getDbClient as jest.Mock).mockResolvedValue({});
});
afterAll(() => {
  if (old === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = old;
});
test("anonymous and forged non-admin rejected before any DB read", async () => {
  for (const [u, status] of [
    [null, 401],
    [
      { id, email: "ordinary@example.invalid", user_metadata: { admin: true } },
      403,
    ],
  ] as const) {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(u);
    expect((await GET(new Request(origin + `?userId=${id}`))).status).toBe(
      status,
    );
  }
  expect(getDbClient).not.toHaveBeenCalled();
  expect(readAnalyticsDetail).not.toHaveBeenCalled();
});
test.each([
  "days=500",
  "userId=bad",
  "kind=credentials",
  "offset=-1",
  "offset=10001",
  "offset=1.2",
  "kind=material",
  `userId=${id}&opportunityId=bad`,
])("invalid request %s rejected", async (q) => {
  expect((await GET(new Request(origin + "?" + q))).status).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("summary success is private and no-store", async () => {
  (readAnalyticsSummary as jest.Mock).mockResolvedValue({
    totals: { users: 2 },
  });
  const result = await GET(new Request(origin));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("vary")).toBe("Cookie");
  expect(readAnalyticsSummary).toHaveBeenCalledWith({}, 30);
});
test("only requested user and page is read", async () => {
  (readAnalyticsDetail as jest.Mock).mockResolvedValue({ rows: [] });
  expect(
    (await GET(new Request(origin + `?userId=${id}&kind=turns&offset=20`)))
      .status,
  ).toBe(200);
  expect(readAnalyticsDetail).toHaveBeenCalledWith({}, id, "turns", 20, null);
  expect(readAnalyticsSummary).not.toHaveBeenCalled();
});
test("missing user is 404, store errors and cap failures never turn into empty stats", async () => {
  (readAnalyticsDetail as jest.Mock).mockResolvedValue(null);
  expect((await GET(new Request(origin + `?userId=${id}`))).status).toBe(404);
  for (const e of [new Error("unavailable"), new Error("analytics_capacity")]) {
    (readAnalyticsSummary as jest.Mock).mockRejectedValue(e);
    const res = await GET(new Request(origin));
    expect(res.status).toBe(503);
    expect((await res.json()).summary).toBeUndefined();
  }
});
