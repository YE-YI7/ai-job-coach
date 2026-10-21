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
