import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { POST as rewrite } from "@/app/api/coach/resume-draft/route";
jest.mock("@/lib/auth", () => ({ getCurrentUserFromRequest: jest.fn() }));
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
jest.mock("@/app/api/coach/resume-draft/route", () => ({ POST: jest.fn() }));
jest.mock("@/lib/coach-harness/eval-observer", () => ({
  withEvalObserver: (_o: unknown, fn: () => unknown) => fn(),
  redactEval: (x: unknown) => x,
  observedResumeLLM: jest.fn(),
}));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  origin = "https://example.com",
  admin = { id: "admin-user", email: "owner@example.invalid" };
const make = (payload: unknown, site = origin) =>
  new Request(origin + "/api/admin/eval-runs", {
    method: "POST",
    headers: { origin: site, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
const body = {
  requestId: id,
  acknowledgeCost: true,
  resumeText: "虚构运营助理，整理商品资料和每周订单表，交给同事复盘。",
  selfEvaluate: false,
};
let original: string | undefined;
beforeAll(() => {
  original = process.env.ADMIN_EMAILS;
});
afterAll(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_EMAILS = "owner@example.invalid";
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(admin);
});
test("both read and model execution reject anonymous/non-admin users before database access", async () => {
  for (const user of [
    null,
    { email: "ordinary@example.invalid", user_metadata: { admin: true } },
  ]) {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);
    expect([401, 403]).toContain((await GET(new Request(origin))).status);
    expect([401, 403]).toContain((await POST(make(body))).status);
  }
  expect(getDbClient).not.toHaveBeenCalled();
  expect(rewrite).not.toHaveBeenCalled();
});
test("CSRF, no cost acknowledgement, identity injection and excessive list requests rejected", async () => {
  expect((await POST(make(body, "https://evil.invalid"))).status).toBe(403);
  expect((await POST(make({ ...body, acknowledgeCost: false }))).status).toBe(
    400,
  );
  expect(
    (await POST(make({ ...body, opportunityId: "old-user-data" }))).status,
  ).toBe(400);
  expect((await GET(new Request(origin + "?limit=1000"))).status).toBe(400);
  expect(rewrite).not.toHaveBeenCalled();
});
test("storage failure and same-ID replay never invoke the model", async () => {
  for (const error of [{ code: "23505" }, { code: "other" }]) {
    (getDbClient as jest.Mock).mockResolvedValue({
      from: () => ({ insert: async () => ({ error }) }),
    });
    expect([202, 503]).toContain((await POST(make(body))).status);
  }
  expect(rewrite).not.toHaveBeenCalled();
});
test("run list excludes development archives instead of presenting them as real model spans", async () => {
  const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), not: jest.fn(() => q), order: jest.fn(() => q), limit: async () => ({ data: [], error: null }) };
  (getDbClient as jest.Mock).mockResolvedValue({ from: () => q });
  expect((await GET(new Request(origin))).status).toBe(200);
  expect(q.not).toHaveBeenCalledWith('run', 'cs', '{"recordType":"development_log"}');
  expect(rewrite).not.toHaveBeenCalled();
});
test("reading a saved run enriches only recorded retrieval and never fabricates stage I/O", async () => {
  const saved = { id, input: "original input", knowledge: [], spans: [{ id: "checkpoint", kind: "stage", name: "知识检索", code: "retrieval", durationMs: 0, input: null, output: null, knowledge: [] }] };
  const query = (data: unknown) => ({ eq: jest.fn().mockReturnThis(), maybeSingle: async () => ({ data, error: null }) });
  (getDbClient as jest.Mock).mockResolvedValue({
    from: (table: string) => ({ select: () => query(table === "coach_eval_runs"
      ? { run: saved, legacy_trace_id: id }
      : { properties: { retrieval: { includedIds: ["method"], documentTitles: [{ id: "method", title: "当次知识标题" }] } } }) }),
  });
  const response = await GET(new Request(origin + "?id=" + id));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const result = (await response.json()).runs[0];
  expect(result.knowledge[0].title).toBe("当次知识标题");
  expect(result.spans[0]).toMatchObject({ durationMs: 0, input: null, output: null });
  expect(saved.knowledge).toEqual([]);
  expect(rewrite).not.toHaveBeenCalled();
});
test("new eval uses only submitted materials, not existing opportunity or answers", async () => {
  const updates: unknown[] = [];
  const update = {
    eq: jest.fn().mockReturnThis(),
    then: (resolve: (x: unknown) => unknown) => resolve({ error: null }),
  };
  const maybe = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: async () => ({
      data: {
        properties: {
          traceId: id,
          outcome: "completed",
          steps: [{ stage: "context", code: "compiled", elapsedMs: 5 }],
          retrieval: { includedIds: ["method"] },
          quality: { score: 100 },
        },
      },
      error: null,
    }),
  };
  const insert = jest.fn().mockResolvedValue({ error: null });
  (getDbClient as jest.Mock).mockResolvedValue({
    from: (table: string) =>
      table === "coach_eval_runs"
        ? {
            insert,
            update: (v: unknown) => {
              updates.push(v);
              return update;
            },
          }
        : { select: () => maybe },
  });
  (rewrite as jest.Mock).mockResolvedValue(
    Response.json({ ok: true, changes: [] }),
  );
  const response = await POST(make(body));
  expect(response.status).toBe(200);
  const request = (rewrite as jest.Mock).mock.calls[0][0];
  expect(await request.json()).toEqual({
    resumeText: body.resumeText,
    jobDescription: "",
    mode: "general_resume",
    requestId: id,
  });
  const result = await response.json();
  expect(result.runs[0].ruleQuality.score).toBe(100);
  expect(result.runs[0].evaluation).toBeNull();
  expect(result.runs[0].spans[0].status).toBe("recorded");
  expect(updates.length).toBeGreaterThan(0);
});
