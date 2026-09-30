/**
 * W5 主动触达治理的对外出口。
 *
 * 用法（给 W6 / route 位）：
 *   const facts = 从库里取到的阶段/轮次/反馈事实;
 *   const outcome = await requestOutreach({ facts, draft });       // 门先行
 *   await recordOutreachDecision(sink, outcome, { userId, turnId });
 *   if (outcome.proposal) 在会话内渲染 outcome.proposal（不自动发送）。
 */

export {
  CLOSED_STAGES,
  DEFAULT_BAD_ANSWER_COOLDOWN_MINUTES,
  DEFAULT_MAX_OUTREACH_PER_DAY,
  DEFAULT_MAX_OUTREACH_PER_TURN,
  DEFAULT_MIN_HOURS_BETWEEN_OUTREACH,
  DEFAULT_OUTREACH_POLICY,
  DEFAULT_STALL_DAYS,
  OUTREACH_BLOCK_CODES,
  type OutreachBlockCode,
  type OutreachDecision,
  type OutreachFacts,
  type OutreachPolicy,
} from "./policy";
export { daysStalled, evaluateOutreachGate, summarizeOutreachDecision } from "./gate";
export {
  OUTREACH_DELIVERY,
  OUTREACH_MAX_SUGGESTIONS,
  OUTREACH_MAX_TEXT_CHARS,
  OUTREACH_SUGGESTION_KINDS,
  assertOutreachIsReadOnly,
  buildOutreachProposal,
  type OutreachBuildResult,
  type OutreachProposal,
  type OutreachSuggestion,
  type OutreachSuggestionKind,
  type OutreachViolation,
} from "./proposal";
export {
  applyOutreachCadence,
  commitOutreach,
  createCadence,
  mergeCadenceIntoFacts,
  recordOutreachDecision,
  requestOutreach,
  type OutreachAuditRecord,
  type OutreachAuditSink,
  type OutreachCadence,
  type OutreachDraft,
  type OutreachDraftContext,
  type OutreachOutcome,
} from "./outreach";
