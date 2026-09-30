/**
 * 槽3 落库前核验（设计文档 §5.3 槽3 / FR-29）：反幻觉与一致性。
 *
 * 全部是包装，不是重写：内部直接调现有实现
 * （guardInsufficientReply / renderGroundedResume / verifyResumeGrounding /
 * findClaimConflicts / validateArtifactDraft），行为一分不变；本文件只把它们的结果翻译成
 * 统一的 GuardDecision，让主链路将来可以 runSlot(3, …) 一把跑完。
 * 后两条目前只在别的端点或编译器内部执行——这里先「可暴露」，
 * 接线时机由 W0/架构位定夺。
 *
 * runSlot 把一个槽输入整体发给每条守卫：守卫各取所需，
 * 取不到自己那份输入时返回 pass(input_absent)，不报错、不猜测。
 */

import {
  guardInsufficientReply,
  type GuardInput,
  type GuardResult,
} from "../insufficiency-guard";
import { renderGroundedResume, type ResumeSource } from "../resume-grounding";
import { verifyResumeGrounding, type RejectReason, type VerifyResumeGroundingInput } from "../citation-verifier";
import { findClaimConflicts, validateArtifactDraft } from "../consistency";
import type { ArtifactDraft, CareerClaim, ContextBundle } from "../types";
import { type GuardDefinition } from "./registry";
import { decide, GUARD_SLOTS, type GuardDecision, type GuardOutcome, type GuardSlot } from "./types";

export const INSUFFICIENCY_GUARD_ID = "verify.insufficiency";
export const GROUNDING_VERIFICATION_GUARD_ID = "verify.resume-grounding";
export const CITATION_GROUNDING_GUARD_ID = "verify.citation-grounding";
export const CLAIM_CONFLICT_GUARD_ID = "verify.claim-conflicts";
export const ARTIFACT_DRAFT_GUARD_ID = "verify.artifact-draft";

/** 槽3 的统一输入：每个落库前轮次能拿到的核验材料。 */
export interface Slot3Input {
  /** 最终正文的旧守卫输入（route 落库前的那一次 guardInsufficientReply）。 */
  reply?: GuardInput;
  /** grounding 核验：模型原始 JSON + 可引用来源。 */
  grounding?: { raw: string; sources: ResumeSource[] };
  /** 引用回指核验：一段改写文本 + 它能引用的来源（FR-23）。 */
  citation?: VerifyResumeGroundingInput;
  /** 本轮作用域内的全部 claim（冲突检测）。 */
  claims?: CareerClaim[];
  /** 待落库的产物草稿与上下文包。 */
  draft?: { artifact: ArtifactDraft; bundle: ContextBundle };
}

/**
 * 旧 GuardResult → 五选一裁决的映射（优先级：block > degrade_to_pending > annotate > pass）。
 * 旧接口的散装布尔（needsMoreInput/blocked/collapsed/downgradedRedundantAsk/claimsHedged）
 * 原样放进 data.legacy，接线前消费方一个字都不用改。
 * 槽2 的逐句守卫共用这一个映射，只换 guardId 与 slot。
 */
export function insufficiencyDecision(
  result: GuardResult,
  guardId: string,
  slot: GuardSlot,
): GuardDecision {
  const data: Record<string, unknown> = {
    answer: result.answer,
    suggestions: result.suggestions,
    legacy: result,
  };
  if (result.blocked) {
    // 真缺口：拒绝并追问（超长伪完整回答已被收敛为澄清问句）。
    return decide(slot, guardId, "block", "insufficient_blocking", "关键信息缺口成立，本轮收敛为澄清追问。", data);
  }
  if (result.downgradedRedundantAsk) {
    // 索要的东西上下文里已有：blocking 被降级为收尾补充，不再拦。
    return decide(
      slot,
      guardId,
      "degrade_to_pending",
      `reask_downgraded:${result.downgradedRedundantAsk}`,
      "模型声明的缺口在已提供材料里已有原文，拦截降级为待补充说明。",
      data,
    );
  }
  if (result.claimsHedged > 0) {
    return decide(
      slot,
      guardId,
      "annotate",
      "unconfirmed_claims_hedged",
      `无依据的“已确认/已掌握”断言 ${result.claimsHedged} 条，已就地标注待确认。`,
      data,
    );
  }
  if (result.level === "partial") {
    return decide(slot, guardId, "pass", "partial_released", "non-blocking 缺口：正文放行，补充提示保留为末句。", data);
  }
  return decide(slot, guardId, "pass", "no_gap_signal", "未声明信息缺口。", data);
}

export function insufficiencyVerificationDecision(input: Slot3Input): GuardDecision {
  if (!input.reply) {
    return decide(GUARD_SLOTS.prePersistenceVerification, INSUFFICIENCY_GUARD_ID, "pass", "input_absent", "本轮未提供待核验正文。");
  }
  return insufficiencyDecision(guardInsufficientReply(input.reply), INSUFFICIENCY_GUARD_ID, GUARD_SLOTS.prePersistenceVerification);
}

/** 简历 grounding 的核验半边：quote 必须回指原文子串，回指不了就拦。 */
export function resumeGroundingVerificationDecision(input: Slot3Input): GuardDecision {
  if (!input.grounding) {
    return decide(GUARD_SLOTS.prePersistenceVerification, GROUNDING_VERIFICATION_GUARD_ID, "pass", "input_absent", "本轮未走简历复核链路。");
  }
  try {
    const draft = renderGroundedResume(input.grounding.raw, input.grounding.sources);
    return decide(GUARD_SLOTS.prePersistenceVerification, GROUNDING_VERIFICATION_GUARD_ID, "pass", "grounding_verified", "抽取的每条经历都能回指简历原文。", { draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "简历事实复核未通过";
    return decide(GUARD_SLOTS.prePersistenceVerification, GROUNDING_VERIFICATION_GUARD_ID, "block", "resume_grounding_failed", message, { error: message });
  }
}

/**
 * 引用类别 → 槽3 裁决（施工判断，待郭屹复核）。
 * 分两档是有意的：
 * - block：文字残缺、动作被扩大、来源里的否定/计划/职责限定被丢掉。这三类正是
 *   PRD R-3 点名的危害形状（「参与」写成「主导」、「计划访谈」写成「访谈了 30 人」），
 *   判定表逐条编码、客观可判，拦下的都是真问题，误伤率零。
 * - annotate：凑不出逐字子串。这一类里混着两种东西——编造的新信息，和改写本来就要做的
 *   换措辞（「负责模型评测」写成「模型评测方案覆盖准确率」）。核验器分不开它们，
 *   一刀切拦会把合规建议一起杀掉（简历台直接长期 422）。所以本轮只记账，
 *   台账里每条带类别码；FR-23 的验收口径本来就是「20 份真实简历跑改写 + 人工双核」，
 *   等这份对比数据出来再裁定升不升成 block（M3.5 裁定：对比数据前不接新判定组件）。
 */
const CITATION_OUTCOME: Record<RejectReason, GuardOutcome> = {
  broken_tail: "block",
  action_not_supported: "block",
  negation_or_hedge_dropped: "block",
  no_exact_substring: "annotate",
  unknown_source_citation: "annotate",
};

const CITATION_COPY: Record<RejectReason, string> = {
  broken_tail: "改写的文字不完整：",
  action_not_supported: "这条改写扩大了动作：",
  negation_or_hedge_dropped: "这条改写丢掉了来源里的限定：",
  no_exact_substring: "这条改写在来源里找不到逐字出处：",
  unknown_source_citation: "这条改写引用的来源不存在：",
};

/**
 * 引用回指核验（FR-23）：一段改写的每一句都必须能在给定来源里找到逐字依据。
 * 判定表全在 citation-verifier.ts 里，本守卫只把拒绝类别翻译成五选一的槽裁决，
 * 一个字不复算。落库确认（FR-24）仍由 `acceptGroundedRewrite` 把关，不靠本守卫。
 */
export function citationGroundingDecision(input: Slot3Input): GuardDecision {
  if (!input.citation) {
    return decide(GUARD_SLOTS.prePersistenceVerification, CITATION_GROUNDING_GUARD_ID, "pass", "input_absent", "本轮没有待回指核验的改写文本。");
  }
  const report = verifyResumeGrounding(input.citation);
  const rejected = report.verdicts.filter((verdict) => verdict.status === "rejected");
  if (rejected.length) {
    const worst = rejected.reduce((acc, verdict) => (CITATION_OUTCOME[verdict.reason] === "block" ? "block" as const : acc), "annotate" as GuardOutcome);
    const first = rejected.find((verdict) => CITATION_OUTCOME[verdict.reason] === worst)!;
    return decide(
      GUARD_SLOTS.prePersistenceVerification,
      CITATION_GROUNDING_GUARD_ID,
      worst,
      `citation_${first.reason}`,
      `${CITATION_COPY[first.reason]}${first.detail}`,
      { report, rejected },
    );
  }
  if (!report.ok) {
    return decide(GUARD_SLOTS.prePersistenceVerification, CITATION_GROUNDING_GUARD_ID, "annotate", "citation_no_statement", "改写文本没有可核验的句子。", { report });
  }
  return decide(GUARD_SLOTS.prePersistenceVerification, CITATION_GROUNDING_GUARD_ID, "pass", "citation_grounded", "改写逐句都能回指来源。", { report });
}

/** claim 冲突检测：目前只在编译器内部执行；此处归位为可挂载的槽3 守卫（行为不变，纯再导出调用）。 */
export function claimConflictDecision(input: Slot3Input): GuardDecision {
  if (!input.claims) {
    return decide(GUARD_SLOTS.prePersistenceVerification, CLAIM_CONFLICT_GUARD_ID, "pass", "input_absent", "本轮未提供 claim 集合。");
  }
  const conflicts = findClaimConflicts(input.claims);
  if (conflicts.length) {
    return decide(
      GUARD_SLOTS.prePersistenceVerification,
      CLAIM_CONFLICT_GUARD_ID,
      "degrade_to_pending",
      "claim_conflicts",
      `发现 ${conflicts.length} 组同一事实的冲突版本，须走二次确认，不得直接当作用户事实。`,
      { conflicts },
    );
  }
  return decide(GUARD_SLOTS.prePersistenceVerification, CLAIM_CONFLICT_GUARD_ID, "pass", "no_claim_conflicts", "未发现同一实体的冲突事实。");
}

/** 产物草稿校验：error 级问题拦截落库，warning 级放行但标注。 */
export function artifactDraftDecision(input: Slot3Input): GuardDecision {
  if (!input.draft) {
    return decide(GUARD_SLOTS.prePersistenceVerification, ARTIFACT_DRAFT_GUARD_ID, "pass", "input_absent", "本轮没有待校验的产物草稿。");
  }
  const report = validateArtifactDraft(input.draft.artifact, input.draft.bundle);
  const base = { report };
  if (!report.ok) {
    const first = report.issues.find((issue) => issue.severity === "error");
    return decide(GUARD_SLOTS.prePersistenceVerification, ARTIFACT_DRAFT_GUARD_ID, "block", "artifact_draft_invalid", first?.message ?? "产物草稿未通过一致性校验。", base);
  }
  if (report.issues.length) {
    return decide(GUARD_SLOTS.prePersistenceVerification, ARTIFACT_DRAFT_GUARD_ID, "annotate", "artifact_draft_warnings", "草稿可用，但存在需要提醒的口径问题。", base);
  }
  return decide(GUARD_SLOTS.prePersistenceVerification, ARTIFACT_DRAFT_GUARD_ID, "pass", "artifact_draft_ok", "草稿全部有据。", base);
}

export const SLOT3_GUARDS: GuardDefinition[] = [
  { id: INSUFFICIENCY_GUARD_ID, run: insufficiencyVerificationDecision },
  { id: GROUNDING_VERIFICATION_GUARD_ID, run: resumeGroundingVerificationDecision },
  { id: CITATION_GROUNDING_GUARD_ID, run: citationGroundingDecision },
  { id: CLAIM_CONFLICT_GUARD_ID, run: claimConflictDecision },
  { id: ARTIFACT_DRAFT_GUARD_ID, run: artifactDraftDecision },
];
