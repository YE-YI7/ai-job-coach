/** Hosted reasoning models reserve internal reasoning and final JSON separately.
 * The shared LLM adapter applies this reserve/schema to Step only. Connected
 * gateways keep their existing model/protocol and final-output token limit. */
export const INTERVIEW_REASONING_RESERVE = 4096;
export const INTERVIEW_CALL_DEADLINE_MS = 55_000;
const text = { type: "string" };
const texts = { type: "array", items: text };
const nullableScore = { type: ["number", "null"] };
const object = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties, required: Object.keys(properties),
});

export const interviewAssessmentSchema = {
  name: "interview_assessment",
  schema: object({
    status: { type: "string", enum: ["assessed", "needs_more_input"] },
    score: nullableScore, summary: text, evidence: texts, missingEvidence: texts,
    dimensions: { type: "array", items: object({ name: text, score: nullableScore, comment: text }) },
    rewritePlan: texts, followUp: text,
  }),
};

export const interviewLinkedQuestionSchema = {
  name: "interview_linked_question",
  schema: object({
    q: text,
    tips: object({ intent: text, keyPoints: texts, framework: text, pitfalls: texts, proTips: texts }),
    sources: { type: "array", items: object({
      source: { type: "string", enum: ["resume", "research", "knowledge", "jd"] }, pointer: text,
    }) },
    linkage: object({
      kind: { type: "string", enum: ["linked"] }, previousQuestionId: text, tookFrom: texts,
      linkage: { type: "string", enum: ["drill_missing_evidence", "follow_confirmed_claim", "contrast_with_material", "extend_to_next_layer"] },
      carriesForward: text,
    }),
  }),
};

/** Bind reference choices before generation; never rewrite a rejected citation. */
export function boundInterviewQuestionSchema(previousQuestionId: string,
  materials?: import("./question-lineage").QuestionMaterials) {
  const schema = JSON.parse(JSON.stringify(interviewLinkedQuestionSchema)) as typeof interviewLinkedQuestionSchema;
  const properties = schema.schema.properties as Record<string, Record<string, unknown>>;
  const linkageProperties = properties.linkage.properties as Record<string, unknown>;
  linkageProperties.previousQuestionId = { type: "string", enum: [previousQuestionId] };
  const choices = Object.entries(materials || {}).flatMap(([source, items]) => (items || []).map(item => object({
    source: { type: "string", enum: [source] }, pointer: { type: "string", enum: [item.id] },
  })));
  if (choices.length) properties.sources = { type: "array", items: { anyOf: choices } };
  return schema;
}
