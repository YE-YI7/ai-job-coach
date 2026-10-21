import {
  readAnalyticsRows,
  readAnalyticsDetail,
} from "./admin-analytics-store";
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture(rows: Record<string, unknown[]> = {}) {
  const reads: {
    table: string;
    fields: string;
    filters: unknown[][];
    range?: number[];
  }[] = [];
  const db = {
    from: (table: string) => {
      const record = {
        table,
        fields: "",
        filters: [] as unknown[][],
        range: undefined as number[] | undefined,
      };
      reads.push(record);
      const query = {
        select: (fields: string) => {
          record.fields = fields;
          return query;
        },
        eq: (...args: unknown[]) => {
          record.filters.push(args);
          return query;
        },
        lt: () => query,
        gte: () => query,
        order: () => query,
        range: (a: number, b: number) => {
          record.range = [a, b];
          return query;
        },
        maybeSingle: async () => ({
          data: table === "users" ? { id } : null,
          error: null,
        }),
        then: (resolve: (r: unknown) => unknown) =>
          resolve({
            data: (rows[table] || []).slice(
              record.range?.[0] || 0,
              (record.range?.[1] ?? 999) + 1,
            ),
            error: null,
          }),
      };
      return query;
    },
  };
  return { db: db as never, reads };
}
test("bounded reads paginate and do not silently truncate", async () => {
  const rows = Array.from({ length: 2001 }, (_, i) => ({ id: String(i) }));
  const a = fixture({ product_events: rows });
  expect(
    (await readAnalyticsRows(a.db, "product_events", "id", null, "end", 3000))
      .length,
  ).toBe(2001);
  expect(a.reads.map((r) => r.range)).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  await expect(
    readAnalyticsRows(a.db, "product_events", "id", null, "end", 2000),
  ).rejects.toThrow("analytics_capacity");
});
test("material whitelist masks contacts and reconstructs working draft without saving", async () => {
  const a = fixture({
    coach_opportunities: [
      {
        id,
        company: "虚构公司",
        role: "实习生",
        resume: "整理活动清单。邮箱 qa@example.invalid，手机号 13900000000。",
        changes: [
          {
            id: "c",
            section: "经历",
            before: "整理活动清单。",
            after: "按日期整理活动清单。",
            status: "accepted",
          },
        ],
        jd_text: "运营支持",
      },
    ],
  });
  const data = await readAnalyticsDetail(a.db, id, "material", 0, id);
  expect(data?.rows[0]).toMatchObject({
    sourceResume: "整理活动清单。邮箱 [邮箱已遮蔽]，手机号 [手机号已遮蔽]。",
    workingResume:
      "按日期整理活动清单。邮箱 [邮箱已遮蔽]，手机号 [手机号已遮蔽]。",
    jd: "运营支持",
  });
  expect(a.reads[1].fields).not.toContain("metadata,");
  expect(a.reads[1].fields).not.toContain("*");
  expect(a.reads[1].filters).toEqual([
    ["user_id", id],
    ["id", id],
  ]);
});
test("normal tutor excludes compiled prompts; resume chat removes leases and plans", async () => {
  const a = fixture({
    coach_agent_turns: [
      {
        id,
        question: "如何改？",
        answer: "**亮点**：真实交付",
        learning_trace: { compiledPrompt: "secret" },
      },
    ],
    coach_resume_tasks: [
      {
        id,
        conversation: [
          {
            id: "t",
            message: "讨论",
            reply: "Bearer not-a-real-fixture-token",
            status: "completed",
            plan: { secret: "private" },
          },
        ],
        answers: [],
      },
    ],
  });
  const tutor = await readAnalyticsDetail(a.db, id, "turns", 0, null);
  expect(JSON.stringify(tutor)).not.toContain("compiledPrompt");
  const resume = await readAnalyticsDetail(a.db, id, "resumeChat", 0, null);
  expect(JSON.stringify(resume)).not.toContain("not-a-real-fixture-token");
  expect(JSON.stringify(resume)).not.toContain("plan");
  expect(
    a.reads.every(
      (r) => !r.fields.includes("*") && !r.fields.includes("learning_trace"),
    ),
  ).toBe(true);
});
test("detail pages 20 rows with continuation, all queries are user-scoped", async () => {
  const a = fixture({
    coach_agent_turns: Array.from({ length: 21 }, (_, i) => ({
      id: String(i),
      question: "问题",
      answer: "回答",
    })),
  });
  const result = await readAnalyticsDetail(a.db, id, "turns", 0, null);
  expect(result?.rows).toHaveLength(20);
  expect(result?.nextOffset).toBe(20);
  expect(a.reads[1].filters).toContainEqual(["user_id", id]);
});
