/**
 * W5 / PRD FR-31：门内的产出契约。
 *
 * 模型只能决定**说什么**。身份、投递方式、能不能改状态，全部由类型和这里的
 * 校验器钉死：
 *  - 发言者永远是导师（speaker: "tutor"），不替用户发第一句；
 *  - 只在会话内出现（delivery: "in_session_only"），不做真实推送、不自动发送；
 *  - 只出建议（requiresUserConfirmation 恒为 true、mutates 恒为 false），
 *    这个模块里不存在任何写状态的路径。
 *
 * 任一校验不过 → 整条主动消息不发（fail-closed），违规项进埋点。
 */

import type { OutreachDecision } from "./policy";

export const OUTREACH_SPEAKER = "tutor" as const;
export const OUTREACH_DELIVERY = "in_session_only" as const;
export const OUTREACH_MAX_TEXT_CHARS = 160;
export const OUTREACH_MAX_SUGGESTIONS = 2;

/** 建议的类型；每个都必须是「等用户点」的动作。 */
export const OUTREACH_SUGGESTION_KINDS = [
  "nudge_stage",
  "offer_next_step",
  "ask_material",
  "resume_practice",
] as const;
export type OutreachSuggestionKind = (typeof OUTREACH_SUGGESTION_KINDS)[number];

export interface OutreachSuggestion {
  kind: OutreachSuggestionKind;
  text: string;
  /** 写死：建议永远需要用户确认后才能变成动作。 */
  requiresUserConfirmation: true;
  /** 写死：建议本身不改任何状态。 */
  mutates: false;
}

export interface OutreachProposal {
  kind: "proactive_outreach";
  speaker: typeof OUTREACH_SPEAKER;
  delivery: typeof OUTREACH_DELIVERY;
  /** 写死：绝不自动发送，更没有代发。 */
  autoSend: false;
  text: string;
  suggestions: OutreachSuggestion[];
  /** 门判定摘要，供「为什么冒出来 / 为什么没冒出来」复盘。 */
  gate: {
    allowed: true;
    evaluatedAt: string;
    stalledDays: number | null;
  };
}

export type OutreachViolation =
  | "gate_denied"
  | "wrong_speaker"
  | "impersonates_user"
  | "auto_send_requested"
  | "state_mutation_requested"
  | "unknown_suggestion_kind"
  | "empty_message"
  | "message_too_long";

export interface OutreachBuildResult {
  proposal: OutreachProposal | null;
  violations: OutreachViolation[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

/**
 * 把模型草稿收敛成可发送的主动消息。草稿是不可信输入：
 * 任何试图改身份、代发、自动发送、直接落状态的字段都判违规，整条丢弃。
 */
export function buildOutreachProposal(input: {
  decision: OutreachDecision;
  draft: unknown;
}): OutreachBuildResult {
  const violations: OutreachViolation[] = [];

  // 门先行：判定不放行时，这里第二次拒绝。模型（或任何调用方）无法绕过规则门。
  if (!input.decision.allowed) {
    return { proposal: null, violations: ["gate_denied"] };
  }

  const draft = asRecord(input.draft);
  if (!draft) return { proposal: null, violations: ["empty_message"] };

  const speaker = draft.speaker ?? draft.role ?? OUTREACH_SPEAKER;
  if (String(speaker).trim().toLowerCase() !== OUTREACH_SPEAKER) violations.push("wrong_speaker");
  if (draft.sendAsUser === true || draft.asUser === true || draft.onBehalfOfUser === true) {
    violations.push("impersonates_user");
  }
  if (draft.autoSend === true || draft.push === true || draft.deliverNow === true) {
    violations.push("auto_send_requested");
  }
  if (draft.mutatesState === true || draft.applyTo !== undefined || draft.patch !== undefined) {
    violations.push("state_mutation_requested");
  }

  const text = typeof draft.text === "string" ? draft.text.trim() : "";
  if (!text) violations.push("empty_message");
  else if (text.length > OUTREACH_MAX_TEXT_CHARS) violations.push("message_too_long");

  const rawSuggestions = Array.isArray(draft.suggestions) ? draft.suggestions.slice(0, OUTREACH_MAX_SUGGESTIONS) : [];
  const suggestions: OutreachSuggestion[] = [];
  for (const raw of rawSuggestions) {
    const item = asRecord(raw);
    const kind = item?.kind;
    const suggestionText = typeof item?.text === "string" ? item.text.trim() : "";
    if (!item || typeof kind !== "string" || !OUTREACH_SUGGESTION_KINDS.includes(kind as OutreachSuggestionKind)) {
      violations.push("unknown_suggestion_kind");
      continue;
    }
    if (!suggestionText) {
      violations.push("empty_message");
      continue;
    }
    // 建议想携带副作用（confirmed:true / skipConfirmation / 直接改状态的字段）就整条拒。
    const wantsMutation =
      item.mutates === true ||
      item.requiresUserConfirmation === false ||
      item.skipConfirmation === true ||
      item.applyNow === true ||
      item.confirmed === true;
    if (wantsMutation) {
      violations.push("state_mutation_requested");
      continue;
    }
    suggestions.push({
      kind: kind as OutreachSuggestionKind,
      text: suggestionText.slice(0, OUTREACH_MAX_TEXT_CHARS),
      requiresUserConfirmation: true,
      mutates: false,
    });
  }

  if (violations.length) return { proposal: null, violations: [...new Set(violations)] };

  return {
    proposal: {
      kind: "proactive_outreach",
      speaker: OUTREACH_SPEAKER,
      delivery: OUTREACH_DELIVERY,
      autoSend: false,
      text,
      suggestions,
      gate: {
        allowed: true,
        evaluatedAt: input.decision.evaluatedAt,
        stalledDays: input.decision.stalledDays,
      },
    },
    violations: [],
  };
}

/**
 * 交付前不变量（评测层可直接调用）：
 * 主动消息必须是导师身份、只建议、不发送、不落状态。
 */
export function assertOutreachIsReadOnly(proposal: OutreachProposal): void {
  if (proposal.speaker !== OUTREACH_SPEAKER) throw new Error("主动消息必须以导师身份发言");
  if (proposal.delivery !== OUTREACH_DELIVERY) throw new Error("主动消息只能在会话内出现");
  if (proposal.autoSend !== false) throw new Error("主动消息不得自动发送");
  for (const suggestion of proposal.suggestions) {
    if (suggestion.mutates !== false) throw new Error("主动消息的建议不得改写状态");
    if (suggestion.requiresUserConfirmation !== true) throw new Error("主动消息的建议必须等用户确认");
  }
}
