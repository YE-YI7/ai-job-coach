/**
 * 岗位评审的结构化输出契约（PRD 2026-10-08 §8.2「新输出契约」）。
 *
 * 为什么要从 `reasons: string[]` 里拆出来：卡片要显示的是「一条依据 + 一条最影响决定的风险」，
 * 而字符串前缀（「可迁移经历：」「待补能力：」）既不能校验，也让界面无法分组——
 * 「资格未知」和「招聘信息待核实」混在一串文本里，用户读到的是同一句「请核实」。
 *
 * 三条纪律：
 * 1. 原文由服务端回填。模型只选引用编号，不重写句子，所以 `requirementRefs/resumeRefs.text`
 *    永远来自本轮候选池里的 JD 片段与简历分句，不是模型生成的。
 * 2. `eligibility` 是判定结果，不是话术。它由硬筛同一套规则复核得出（`hardFilter` 再跑一遍），
 *    已知资格冲突（conflict）一律不进优先候选——这是 §9.1 的独立硬失败，不能被高分抵消。
 * 3. `decisionRisk` 恰好一条。资格未知 > 实际差距 > 招聘信息待核实：越影响「能不能投」的越先看。
 */
import { hardFilter } from "@/lib/coach-harness/subagents/retrieval";
import { jdHardRequirements, profileHardFields, PENDING_LABEL, type HardDimension } from "./retrieval-gate";
import type { VerifiedJob } from "./verification-gate";

export type JobEligibility = "pass" | "unknown" | "conflict";
export type DecisionRiskKind = "eligibility_unknown" | "capability_gap" | "listing_unverified";

export interface ReviewEvidence {
  /** 本轮输入里的编号：换一批候选它就失效，所以只在本批次内有意义。 */
  id: number;
  /** 服务端回填的连续原文。 */
  text: string;
}

export interface JobReview {
  jobId: string;
  eligibility: JobEligibility;
  requirementRefs: ReviewEvidence[];
  resumeRefs: ReviewEvidence[];
  /** 「用户做过什么 → 对应岗位哪项职责」，由两侧原文组成。 */
  fitReason: string;
  decisionRisk: { kind: DecisionRiskKind; text: string } | null;
  /** 主操作固定复用已有的岗位分析入口，不为每张卡另起一遍收费评审。 */
  nextAction: "assess_this_job";
}

const STUDENT_REASON = "需核实在读身份";
const CITY_CONFLICT_REASON = "地点待核实";

/**
 * 资格判定。kept 里的岗位本该过完硬筛，这里再算一遍是给契约上保险：
 * 调用方漏过闸门、或者资格规则与展示话术日后分叉时，冲突岗会被拦在优先候选之外。
 */
export function deriveEligibility(job: VerifiedJob, resume: string): JobEligibility {
  const { hard } = jdHardRequirements(`${job.title}\n${job.location}\n${job.description}`);
  if (hardFilter(hard, profileHardFields(resume)).verdict === "drop") return "conflict";
  if (job.hardVerdict === "keep_pending_profile" || job.pendingProfileFields.length) return "unknown";
  if (job.reasons.some((reason) => reason.startsWith(STUDENT_REASON) || reason.startsWith(CITY_CONFLICT_REASON))) return "unknown";
  return "pass";
}

/** 档案缺项那几维，对应的 JD 门槛就是「要先确认」的内容。 */
function unprovenRequirement(job: VerifiedJob, dimensions: HardDimension[]): string | null {
  const hit = job.jdRequirements.find((requirement) => dimensions.includes(requirement.dimension));
  if (!hit) return null;
  return `该岗要求「${hit.label}」，你的材料里还没有可核对的${PENDING_LABEL[hit.dimension]}`;
}

/** 文本 = 判定依据本身，不再叠第二层前缀，免得同一句话出现两种说法。 */
export function decisionRiskFor(job: VerifiedJob, gap: string | null): JobReview["decisionRisk"] {
  const unknown = job.reasons.find((reason) => reason.startsWith(STUDENT_REASON) || reason.startsWith(CITY_CONFLICT_REASON));
  if (unknown) return { kind: "eligibility_unknown", text: unknown };
  const unproven = unprovenRequirement(job, job.pendingProfileFields);
  if (unproven) return { kind: "eligibility_unknown", text: unproven };
  if (gap) return { kind: "capability_gap", text: gap };
  // 层次未核验、发布时间滞后都属于「招聘信息待核实」，排在资格与差距之后才说。
  if (job.freshness !== "in_sale") return { kind: "listing_unverified", text: "发布时间较早或未给出，是否仍在招请回原页核实" };
  if (!job.verified) return { kind: "listing_unverified", text: "公司层次本次未核实，不据此排除" };
  return null;
}

export function buildReview(input: {
  job: VerifiedJob;
  resume: string;
  resumeQuote: ReviewEvidence | null;
  jdQuote: ReviewEvidence;
  gap: string | null;
}): JobReview {
  const resumeRefs = input.resumeQuote ? [input.resumeQuote] : [];
  return {
    jobId: input.job.id,
    eligibility: deriveEligibility(input.job, input.resume),
    requirementRefs: [input.jdQuote],
    resumeRefs,
    fitReason: input.resumeQuote
      ? `你做过「${input.resumeQuote.text}」，与该岗「${input.jdQuote.text}」相近`
      : `简历暂未提供此岗的直接经历；该岗职责为「${input.jdQuote.text}」`,
    decisionRisk: decisionRiskFor(input.job, input.gap),
    nextAction: "assess_this_job",
  };
}

/**
 * 界面旧文案的唯一来源：结构化字段决定内容，不再有两套拼接口径。
 * 顺序与拆分前保持一致（可迁移经历 → 岗位依据 → 待补能力 → 可以先练 → 待核实项）。
 */
export function reviewReasons(review: JobReview, job: VerifiedJob, extra: { gap: string | null; learn: string | null }): string[] {
  const learnLine = extra.learn ? `可以先练：${extra.learn}` : null;
  // gap 已经按优先级归入 decisionRisk；这里保留旧展示位，避免同一句话在契约里出现两处。
  const gapLine = extra.gap ? `待补能力：${extra.gap}` : null;
  return [
    ...(review.resumeRefs.length ? [`可迁移经历：${review.resumeRefs[0].text}`] : ["简历暂未提供此岗的直接经历"]),
    `岗位依据：${review.requirementRefs[0].text}`,
    ...(gapLine ? [gapLine] : []),
    ...(learnLine ? [learnLine] : []),
    ...job.reasons.filter((reason) => reason.startsWith(STUDENT_REASON) || reason.startsWith(CITY_CONFLICT_REASON) || reason.includes("远程")),
  ];
}
