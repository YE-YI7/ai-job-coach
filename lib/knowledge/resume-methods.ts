import { reviewedResumeMethods } from "./document-repository";
import { retrieveResumeExamples } from "./resume-examples";
import type { ContextBundle } from "@/lib/coach-harness/types";

export const RESUME_METHOD_IDS = [
  "resume.factual-rewriting.v1",
  "resume.progressive-discovery.v1",
  "resume.layout-and-export.v1",
] as const;

/** Select candidates, not admitted context. The caller must run the context
 * compiler afterwards; user facts/answers outrank every optional reference. */
export function selectResumeDraftKnowledge(resume: string, target: string, existing: ContextBundle["knowledge"] = []) {
  const methods = reviewedResumeMethods(RESUME_METHOD_IDS);
  const examples = retrieveResumeExamples({ resume, target });
  const candidates: ContextBundle["knowledge"] = [...methods, ...examples.map(item => item.document)].map(document => ({
    id: document.id, title: document.title, content: document.content,
    description: document.description, goal: document.goal, scope: document.scope, confidence: document.confidence,
    evidenceUrls: document.evidence.map(item => item.url),
  }));
  const seen = new Set<string>();
  return { methods, examples, knowledge: [...candidates, ...existing].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }) };
}
