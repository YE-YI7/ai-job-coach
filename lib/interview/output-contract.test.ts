import { interviewAssessmentSchema, interviewLinkedQuestionSchema, boundInterviewQuestionSchema, INTERVIEW_CALL_DEADLINE_MS, INTERVIEW_REASONING_RESERVE } from "./output-contract";

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

test("hosted reference schema permits only paired IDs from loaded materials and the actual prior question", () => {
  const result = boundInterviewQuestionSchema("actual-question", {
    jd: [{ id: "interview-jd", text: "JD" }], resume: [{ id: "resume-text", text: "简历" }],
  });
  const properties = result.schema.properties as Record<string, Record<string, unknown>>;
  expect((properties.linkage.properties as Record<string, unknown>).previousQuestionId)
    .toEqual({ type: "string", enum: ["actual-question"] });
  expect(properties.sources.items).toMatchObject({ anyOf: [
    { properties: { source: { enum: ["jd"] }, pointer: { enum: ["interview-jd"] } } },
    { properties: { source: { enum: ["resume"] }, pointer: { enum: ["resume-text"] } } },
  ] });
  // The shared constant and non-hosted contracts are not mutated by a request.
  expect((interviewLinkedQuestionSchema.schema.properties.linkage as Record<string, unknown>)).not.toHaveProperty("enum");
});
