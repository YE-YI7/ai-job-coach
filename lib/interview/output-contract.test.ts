import { interviewAssessmentSchema, interviewLinkedQuestionSchema, INTERVIEW_CALL_DEADLINE_MS, INTERVIEW_REASONING_RESERVE } from "./output-contract";

test("assessment schema retains evidence, gaps, dimensions and rewrite rather than deleting them to fit", () => {
  expect(interviewAssessmentSchema.schema.required).toEqual([
    "status", "score", "summary", "evidence", "missingEvidence", "dimensions", "rewritePlan", "followUp",
  ]);
  expect(interviewAssessmentSchema.schema.additionalProperties).toBe(false);
  expect(interviewAssessmentSchema.schema.properties.score).toEqual({ type: ["number", "null"] });
  expect(INTERVIEW_REASONING_RESERVE).toBe(4096);
  expect(INTERVIEW_CALL_DEADLINE_MS).toBeLessThan(60_000);
});

test("linked question schema keeps exact-answer lineage and source pointers mandatory", () => {
  expect(interviewLinkedQuestionSchema.schema.required).toEqual(["q", "tips", "sources", "linkage"]);
  const linkage = interviewLinkedQuestionSchema.schema.properties.linkage as { required: string[] };
  expect(linkage.required).toEqual(["kind", "previousQuestionId", "tookFrom", "linkage", "carriesForward"]);
});
