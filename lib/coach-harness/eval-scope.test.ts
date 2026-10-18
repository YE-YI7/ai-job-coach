import {
  captureEvalStage,
  getEvalObserver,
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
