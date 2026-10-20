import {
  captureEvalStage,
  getEvalObserver,
  knowledgeFromRetrieval,
  presentEvalRun,
  redactEval,
  withEvalObserver,
  withEvalStages,
  type EvalSpan,
} from "./eval-scope";

test("private stages capture actual input/output only inside an observer", async () => {
  captureEvalStage(
    "context",
    "compiled",
    { input: "outside", output: "outside" },
    0,
    1,
  );
  expect(getEvalObserver()).toBeUndefined();
  const spans: EvalSpan[] = [];
  await withEvalObserver({ spans, save: async () => {} }, async () => {
    captureEvalStage(
      "context",
      "compiled",
      { input: { resume: "synthetic" }, output: { claims: ["fact"] } },
      0,
      1,
    );
    captureEvalStage("review", "metadata_only", undefined, 0, 1);
  });
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({
    kind: "stage",
    name: "材料与上下文",
    input: { resume: "synthetic" },
    output: { claims: ["fact"] },
  });
  expect(getEvalObserver()).toBeUndefined();
});
test("real stage payload replaces only the same metadata checkpoint", () => {
  const meta = {
    id: "old",
    kind: "stage",
    name: "材料与上下文",
    code: "compiled",
    startedAt: "2026-10-18T00:00:00Z",
    input: null,
    output: null,
  };
  const actual = { ...meta, id: "actual", input: "source", output: "claims" };
  const result = withEvalStages({
    stages: [meta, { ...meta, id: "other", code: "other" }],
    spans: [actual],
  });
  expect(result.spans.map((s) => s.id)).toEqual(["other", "actual"]);
  expect(result.spans.find((s) => s.id === "actual")?.input).toBe("source");
});
test("retrieval keeps included, excluded and example titles", () => {
  const items = knowledgeFromRetrieval(
    {
      includedIds: ["method-1"],
      methodCandidateIds: ["method-1", "method-2"],
      excludedByBudgetIds: ["method-2"],
      matches: [{ id: "example-1", similarity: 0.4 }],
      documentTitles: [{ id: "method-1", title: "事实改写" }],
    },
    { "example-1": "门店运营样例" },
  ).map((item) => [item.id, item.title, item.included, item.reason]);
  expect(items).toEqual([
    ["method-1", "事实改写", true, "实际纳入上下文"],
    ["method-2", "method-2", false, "因上下文预算未纳入"],
    ["example-1", "门店运营样例", false, "候选，未纳入"],
  ]);
});
test("saved runs show catalog titles on the retrieval stage", () => {
  const result = presentEvalRun(
    {
      knowledge: [{ id: "method-1", title: "method-1", included: true, kind: "knowledge" }],
      spans: [
        {
          id: "stage",
          kind: "stage",
          name: "知识检索",
          code: "reviewed_methods_in_context",
          knowledge: [],
          output: {
            retrieval: {
              includedIds: ["method-1"],
              excludedByBudgetIds: ["method-2"],
            },
          },
        },
      ],
    },
    { "method-1": "事实改写", "method-2": "短句" },
  );
  expect(result.knowledge.map((item: { title: string }) => item.title)).toEqual([
    "事实改写",
    "短句",
  ]);
  expect(result.spans[0].knowledge).toHaveLength(2);
});
test("partial retrieval summaries preserve captured knowledge and stage-specific evidence", () => {
  const stageKnowledge = [{ id: "actual", title: "当次标题", included: true, kind: "method", excerpt: "当次片段" }];
  const original = {
    knowledge: stageKnowledge,
    spans: [{ id: "stage", kind: "stage", name: "知识检索", knowledge: stageKnowledge }],
  };
  const result = presentEvalRun(original, { other: "另一文档" }, { includedIds: ["other"] });
  expect(result.knowledge.map((entry) => entry.id)).toEqual(["other", "actual"]);
  expect(result.spans[0].knowledge).toEqual(stageKnowledge);
  expect(original.knowledge).toHaveLength(1);
});
test("credentials and task leases never enter private I/O", () => {
  expect(
    redactEval({
      resumeTaskLease: "private",
      headers: { cookie: "private" },
      source: "Bearer abcdefghijk",
    }),
  ).toEqual({
    resumeTaskLease: "[已屏蔽凭据]",
    headers: { cookie: "[已屏蔽凭据]" },
    source: "Bearer [已屏蔽]",
  });
});
