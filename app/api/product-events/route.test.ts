import { NextRequest } from "next/server";
import { POST } from "./route";
import { getCurrentUserId } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
jest.mock("@/lib/auth", () => ({ getCurrentUserId: jest.fn() }));
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
const upsert = jest.fn().mockResolvedValue({ error: null });
const oldEnv = process.env.VERCEL_ENV;
beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUserId as jest.Mock).mockResolvedValue(null);
  (getDbClient as jest.Mock).mockResolvedValue({ from: () => ({ upsert }) });
  process.env.VERCEL_ENV = "production";
});
afterAll(() => {
  if (oldEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = oldEnv;
});
const request = (body: unknown) =>
  new NextRequest("https://example.invalid/api/product-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
test("page view uses server host/environment and no user-controlled internal flag", async () => {
  const res = await POST(
    request({
      name: "page_viewed",
      clientEventId: "fixture-12345678",
      anonId: "anon-fixture-id",
      properties: {
        page: "/",
        host: "spoof.invalid",
        environment: "preview",
        account_cohort: "internal",
      },
    }),
  );
  expect(res.status).toBe(200);
  expect(upsert.mock.calls[0][0].properties).toMatchObject({
    page: "/",
    host: "example.invalid",
    environment: "production",
    account_cohort: "unclassified",
  });
  expect(upsert.mock.calls[0][1]).toMatchObject({ ignoreDuplicates: true });
});
test("missing identity and arbitrary event rejected without database access", async () => {
  expect(
    (
      await POST(
        request({ name: "page_viewed", clientEventId: "fixture-12345678" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          name: "not-controlled",
          clientEventId: "fixture-12345678",
          anonId: "anon-fixture-id",
        }),
      )
    ).status,
  ).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("server delivery outcomes and raw resume text cannot be posted by the browser", async () => {
  expect((await POST(request({ name: "resume_task_outcome", clientEventId: "fixture-12345678", anonId: "anon-fixture-id", properties: { outcome: "delivered" } }))).status).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled();
  const presented = await POST(request({ name: "resume_result_presented", clientEventId: "fixture-12345678", anonId: "anon-fixture-id", properties: { generation_id: "12345678-1234-4234-9234-123456789abc:4", resumeText: "真实简历" } }));
  expect(presented.status).toBe(401);
  (getCurrentUserId as jest.Mock).mockResolvedValue('owner');
  const query={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),limit:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{properties:{schema_version:2,persistence:'confirmed',change_ids:'change-1234'}}})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>({...query,upsert})});
  const owned=await POST(request({name:'resume_result_presented',clientEventId:'fixture-12345678',properties:{generation_id:'12345678-1234-4234-9234-123456789abc:4',resumeText:'真实简历'}}));
  expect(owned.status).toBe(200);
  expect(upsert.mock.calls.at(-1)?.[0].properties).toMatchObject({ schema_version: 2, generation_id: "12345678-1234-4234-9234-123456789abc:4" });
  expect(upsert.mock.calls.at(-1)?.[0].properties.resumeText).toBeUndefined();
  expect(upsert.mock.calls.at(-1)?.[0].client_event_id).toMatch(/^resume-result-presented-/);
  query.maybeSingle.mockResolvedValue({data:null} as never);
  expect((await POST(request({name:'resume_change_decided',clientEventId:'fixture-12345678',properties:{generation_id:'12345678-1234-4234-9234-123456789abc:4',change_id:'change-1234',decision:'accept'}}))).status).toBe(403);
});
