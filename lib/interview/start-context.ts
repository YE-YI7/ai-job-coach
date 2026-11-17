import { compileContextBundle, estimateTokens } from "@/lib/coach-harness/context";
import { assertContextFits, ContextBudgetExceededError, renderContextForPrompt } from "@/lib/coach-harness/prompt";
import type { CareerClaim, ContextAttachment, ContextBundle } from "@/lib/coach-harness/types";
import { interviewMaterials, type QuestionMaterials } from "./question-lineage";

const INITIAL_INPUT_BUDGET = 12_000;
const OPTIONAL_MATERIAL_ALLOWANCE = 4_000;
/** Application safety ceiling, not a claim about every provider's context window.
 * It covers the final rendered prompt too; no selected fact is clipped to fit. */
export const INTERVIEW_MAX_INPUT_TOKENS = 64_000;
export const INTERVIEW_CAPACITY_MESSAGE =
  "本次完整面试资料超出单次出题容量，需要分批处理；原资料和已确认事实均已保留，本次未完成出题。";

/** Expand from the compiler's measured mandatory costs, not a fixed fact count.
 * The same all-required selection and original source text survive recompilation. */
type InterviewContextInput = {
  userId: string;
  claims: CareerClaim[];
  attachments: ContextAttachment[];
  knowledge: ContextBundle["knowledge"];
  currentInput?: string;
  questionSource?: { id: string; text: string };
};

function completeContext(input: InterviewContextInput) {
  const compile = (maxInputTokens: number) => compileContextBundle({
    ...input, task: "mock_interview", claimSelection: "all_required", budget: { maxInputTokens },
  });
  const initial = compile(INITIAL_INPUT_BUDGET);
  const blockedTokens = initial.selection.excluded
    .filter(entry => entry.required && entry.reason === "budget_exhausted")
    .reduce((sum, entry) => sum + entry.cost, 0);
  const budget = blockedTokens
    ? Math.min(INTERVIEW_MAX_INPUT_TOKENS, initial.usage.usedTokens + blockedTokens + OPTIONAL_MATERIAL_ALLOWANCE)
    : INITIAL_INPUT_BUDGET;
  const context = blockedTokens ? compile(budget) : initial;
  assertContextFits(context);
  return context;
}

export function buildInterviewStartContext(input: InterviewContextInput) {
  const context = completeContext(input);
  const rendered = renderContextForPrompt(context);
  const materials = interviewMaterials(context);
  // Confirmed archive facts are also actual candidate evidence. Keeping them in
  // the prompt but absent from the citation index made valid fact IDs unusable.
  const sourceMaterials: QuestionMaterials = {
    ...materials,
    resume: [...(materials.resume || []), ...context.claims.map(claim => ({
      id: claim.id,
      text: [claim.displayText, claim.sourceExcerpt].filter(Boolean).join("\n"),
    }))],
  };
  return { context, rendered, sourceMaterials };
}

/** Assessment has separate question/answer fields; keep them mandatory in the
 * compiler while avoiding a second copy in its rendered material list. */
export function buildInterviewAnswerContext(input: InterviewContextInput) {
  const context = completeContext(input);
  return { context, rendered: renderContextForPrompt(context, { excludeKinds: ["question_source", "current_input"] }) };
}

/** Run against the exact system/user strings, including headers and citation index,
 * before the provider request. Never trim text or drop facts in this guard. */
export function assertInterviewPromptFits(system: string, user: string) {
  const cost = estimateTokens(system) + estimateTokens(user);
  if (cost > INTERVIEW_MAX_INPUT_TOKENS) {
    throw new ContextBudgetExceededError(INTERVIEW_CAPACITY_MESSAGE,
      [{ kind: "current_input", refId: "interview-full-prompt", cost }]);
  }
}
