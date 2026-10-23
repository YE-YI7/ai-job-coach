import { GET } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { readBusinessDataset,readBusinessSessions,readBusinessMaterial } from "@/lib/admin-analytics-business-store";
import {
  readAnalyticsSummary,
  readAnalyticsDetail,
} from "@/lib/admin-analytics-store";
jest.mock("@/lib/auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
jest.mock("@/lib/admin-analytics-business-store", () => ({ readBusinessDataset: jest.fn(), readBusinessSessions: jest.fn(),readBusinessMaterial:jest.fn() }));
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
const period="from=2026-10-22&to=2026-10-22&asOf=2026-10-22T10%3A00%3A00.000Z";
test.each(["feature=bogus","cohort=banana","scope=delete","stage=banana","source=secret","minRounds=-1","minRounds=3&maxRounds=2","offset=1.5","search=bad","session=../bad","full=1","opportunityId=bad","asOf=2099-01-01T00%3A00%3A00Z"])("invalid business filter is rejected before DB: %s",async q=>{
 const res=await GET(new Request(`${origin}?view=users&from=2026-10-22&to=2026-10-22&${q}`));expect(res.status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();
});
test("arbitrary date, combined filters, stable snapshot and offset reach the store",async()=>{
 (readBusinessDataset as jest.Mock).mockResolvedValue({users:{rows:[],total:0}});
 const r=await GET(new Request(`${origin}?view=users&${period}&feature=resume,mentor&cohort=new&scope=all&minRounds=2&offset=20&search=${id}`));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");
 expect(readBusinessDataset).toHaveBeenCalledWith({},"2026-10-22","2026-10-22","resume,mentor",20,expect.objectContaining({asOf:"2026-10-22T10:00:00.000Z",scope:"all",minRounds:2,userId:id}));
});
test("session pagination/full query and cross-owner refusal never fall back to another session",async()=>{
 (readBusinessSessions as jest.Mock).mockResolvedValue(null);
 const r=await GET(new Request(`${origin}?view=sessions&${period}&userId=${id}&session=${id}&offset=40&full=1`));expect(r.status).toBe(404);expect(readBusinessSessions).toHaveBeenCalledWith({},id,"2026-10-22","2026-10-22",expect.objectContaining({session:id,offset:40,full:true}));
});
test("material requires explicit owner and opportunity, and preserves 404",async()=>{
 (readBusinessMaterial as jest.Mock).mockResolvedValue(null);
 const r=await GET(new Request(`${origin}?view=material&${period}&userId=${id}&opportunityId=${id}`));expect(r.status).toBe(404);expect(readBusinessMaterial).toHaveBeenCalledWith({},id,id);
});
test.each(["daily","users","sessions","material"])("new %s surface retains anonymous/private admin gate",async view=>{
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);expect((await GET(new Request(`${origin}?view=${view}&${period}`))).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();
});
