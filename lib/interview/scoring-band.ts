/**
 * W4（FR-28 + 决策 D3）：评分锚定规则+样例、异族评审模型、重跑方差带。
 *
 * 结构性保证：本模块的「分数」类型是 BandedScore——数值、±浮动区间、推导依据
 * 三者绑成一个对象。裸数字在这个类型体系里不构成合法分数：
 *   - 编译期：BandedScore 各字段必填，凑不出缺字段的对象；
 *   - 运行期：assertScoreShipsWithExplanation 是出分前唯一闸门，
 *     JSON 序列化丢字段、旧代码传 number 都会在这里抛错（「无解释的分数视为缺陷」）。
 *
 * D3 落地：
 *   1. 评审模型必须与答题模型异族（modelFamily 按仓内既有约定取厂商前缀）；
 *   2. 同一答案重跑 RESCORE_RUNS 次，极差超过声明阈值 MAX_RESCORE_SPREAD 时
 *      不出分——不稳定的分数宁可拒发，也不 bare number 糊弄用户；
 *   3. 出分必带 derivation：rubric 锚点、对照样例、引用到的回答证据、
 *      两个模型及族别、重跑明细、极差，以及一句人能读懂的「分数怎么来的」。
 */

import type { InterviewAssessment } from "./types";

// ========== 类型 ==========

export interface ScoreBand {
  minus: number;
  plus: number;
  /** 展示用标签，如 "±3"。前端浮动区间直接渲染它（W6 对接的形状见文件底部注释）。 */
  label: string;
}

export interface ScoreDerivation {
  /** 打分锚定的规则条款（必填，非空）。 */
  rubricAnchor: string;
  /** 对照过的分数样例（合格/不合格样例的指针，至少 1 条）。 */
  workedExampleRefs: string[];
  /** 评审引用到的候选人回答原文片段（至少 1 条）——没读到证据就不出分。 */
  evidenceUsed: string[];
  reviewerModel: string;
  reviewerFamily: string;
  answeringModel: string;
  answeringFamily: string;
  /** 同一答案的每次独立重跑分数，长度 ≥ RESCORE_RUNS。 */
  rescores: number[];
  /** 重跑极差（max - min）。 */
  spread: number;
  /** 人话版：这个分数是怎么来的。缺了它，分数就是缺陷。 */
  explanation: string;
}

export interface BandedScore {
  value: number;
  band: ScoreBand;
  derivation: ScoreDerivation;
}

/** 出分后的整轮单题评估：score 只能是 BandedScore 或 null（needs_more_input）。 */
export interface ScoredInterviewAssessment extends Omit<InterviewAssessment, "score"> {
  score: BandedScore | null;
}

// ========== 常量与错误 ==========

/** 同一答案的重跑次数（方差带的样本量）。 */
export const RESCORE_RUNS = 3;

/** 声明阈值：重跑极差超过它，分数不可信，拒发。单位：分。 */
export const MAX_RESCORE_SPREAD = 6;

export class BareScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BareScoreError";
  }
}

export class ReviewerFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerFamilyError";
  }
}

export class RescoreVarianceError extends Error {
  readonly rescores: number[];
  readonly spread: number;
  constructor(message: string, rescores: number[], spread: number) {
    super(message);
    this.name = "RescoreVarianceError";
    this.rescores = rescores;
    this.spread = spread;
  }
}

// ========== 模型族（D3：评审必须异族） ==========

/** 与 lib/coach-harness/chat-models 同一约定：厂商族 = 模型 id 首段。 */
export function modelFamily(model: string): string {
  return String(model || "").trim().toLowerCase().split("-")[0];
}

export function assertDistinctModelFamily(input: { answeringModel: string; reviewerModel: string }): void {
  const answering = modelFamily(input.answeringModel);
  const reviewer = modelFamily(input.reviewerModel);
  if (!answering || !reviewer) {
    throw new ReviewerFamilyError("答题模型或评审模型缺失——无法核验 D3 的异族要求");
  }
  if (answering === reviewer) {
    throw new ReviewerFamilyError(
      `评审模型与答题模型同族（${answering}）：D3 要求评审必须换模型家族，否则方差带只是同一个模型的自我复读`,
    );
  }
}

// ========== 组装与闸门 ==========

export interface BandedScoreInput {
  /** 同一答案的独立重跑结果，长度必须 ≥ RESCORE_RUNS。 */
  rescores: number[];
  rubricAnchor: string;
  workedExampleRefs: string[];
  evidenceUsed: string[];
  answeringModel: string;
  reviewerModel: string;
  /** 可选补充：这句依据说明会并入 explanation。 */
  note?: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 从多次重跑组装 BandedScore：value 取中位数，band 覆盖全部重跑散布。
 * 重跑次数不足、分数越界、极差超阈值、评审同族——都在出分前抛错。
 */
export function buildBandedScore(input: BandedScoreInput): BandedScore {
  assertDistinctModelFamily({ answeringModel: input.answeringModel, reviewerModel: input.reviewerModel });

  if (!Array.isArray(input.rescores) || input.rescores.length < RESCORE_RUNS) {
    throw new BareScoreError(`方差带需要至少 ${RESCORE_RUNS} 次独立重跑，实际 ${Array.isArray(input.rescores) ? input.rescores.length : 0} 次——没有重跑就没有浮动区间`);
  }
  input.rescores.forEach((score, index) => {
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new BareScoreError(`rescores[${index}]「${String(score)}」不是 0-100 的有效分数`);
    }
  });
  if (!input.rubricAnchor || !input.rubricAnchor.trim()) {
    throw new BareScoreError("缺少 rubric 锚点——FR-28 要求评分锚定规则，无锚点不出分");
  }
  if (!Array.isArray(input.workedExampleRefs) || input.workedExampleRefs.length === 0) {
    throw new BareScoreError("缺少对照的分数样例——FR-28 要求评分锚定规则+样例");
  }
  if (!Array.isArray(input.evidenceUsed) || input.evidenceUsed.length === 0) {
    throw new BareScoreError("评审没有引用任何回答原文——未读到证据不出分");
  }

  const spread = Math.max(...input.rescores) - Math.min(...input.rescores);
  if (spread > MAX_RESCORE_SPREAD) {
    throw new RescoreVarianceError(
      `同一答案 ${input.rescores.length} 次重跑极差 ${spread} 分，超过声明阈值 ${MAX_RESCORE_SPREAD} 分——评分不稳定，本轮不出这个分数`,
      input.rescores,
      spread,
    );
  }

  const value = Math.round(median(input.rescores));
  const minus = Math.max(0, Math.round(value - Math.min(...input.rescores)));
  const plus = Math.max(0, Math.round(Math.max(...input.rescores) - value));
  const label = `±${Math.max(minus, plus)}`;

  const derivation: ScoreDerivation = {
    rubricAnchor: input.rubricAnchor.trim(),
    workedExampleRefs: input.workedExampleRefs.map((ref) => String(ref).trim()).filter(Boolean),
    evidenceUsed: input.evidenceUsed.map((item) => String(item).trim()).filter(Boolean),
    reviewerModel: input.reviewerModel,
    reviewerFamily: modelFamily(input.reviewerModel),
    answeringModel: input.answeringModel,
    answeringFamily: modelFamily(input.answeringModel),
    rescores: [...input.rescores],
    spread,
    explanation:
      `基于规则「${input.rubricAnchor.trim()}」对照 ${input.workedExampleRefs.length} 个样例打分，` +
      `引用了 ${input.evidenceUsed.length} 条回答原文；` +
      `同一答案由评审模型 ${input.reviewerModel}（${modelFamily(input.reviewerModel)} 族，与答题模型 ${input.answeringModel} 异族）` +
      `独立重跑 ${input.rescores.length} 次得 ${input.rescores.join(" / ")} 分，极差 ${spread} 分，取中位数 ${value} 分` +
      (input.note ? `；${input.note}` : "") +
      "。",
  };

  return { value, band: { minus, plus, label }, derivation };
}

/**
 * 出分前唯一闸门：任何要交给用户/前端/落库的 score 必须过这里。
 * 传裸数字、缺 band、缺 derivation、缺 explanation——全部判缺陷抛错。
 */
export function assertScoreShipsWithExplanation(candidate: unknown): BandedScore {
  if (typeof candidate === "number") {
    throw new BareScoreError("裸数字不是分数：FR-28/D3 要求分数必须带 ±浮动区间与推导依据一起出");
  }
  if (!candidate || typeof candidate !== "object") {
    throw new BareScoreError("分数对象缺失——无解释的分数视为缺陷");
  }
  const score = candidate as Record<string, unknown>;
  if (typeof score.value !== "number" || !Number.isFinite(score.value) || score.value < 0 || score.value > 100) {
    throw new BareScoreError("分数对象缺少合法的 value（0-100）");
  }
  const band = score.band as Record<string, unknown> | undefined;
  if (!band || typeof band !== "object" || typeof band.minus !== "number" || typeof band.plus !== "number" || typeof band.label !== "string" || !band.label.trim()) {
    throw new BareScoreError("分数没有随附 ±浮动区间（band）——按缺陷处理，不出分");
  }
  const derivation = score.derivation as Record<string, unknown> | undefined;
  if (!derivation || typeof derivation !== "object") {
    throw new BareScoreError("分数没有推导依据（derivation）——无解释的分数视为缺陷");
  }
  if (typeof derivation.rubricAnchor !== "string" || !derivation.rubricAnchor.trim()) {
    throw new BareScoreError("依据缺少 rubric 锚点");
  }
  if (!Array.isArray(derivation.workedExampleRefs) || derivation.workedExampleRefs.length === 0) {
    throw new BareScoreError("依据缺少对照样例");
  }
  if (!Array.isArray(derivation.evidenceUsed) || derivation.evidenceUsed.length === 0) {
    throw new BareScoreError("依据未引用回答原文");
  }
  if (
    typeof derivation.explanation !== "string" ||
    !derivation.explanation.trim() ||
    !Array.isArray(derivation.rescores) ||
    derivation.rescores.length < RESCORE_RUNS ||
    typeof derivation.spread !== "number" ||
    typeof derivation.reviewerModel !== "string" ||
    typeof derivation.answeringModel !== "string" ||
    !derivation.reviewerFamily ||
    !derivation.answeringFamily
  ) {
    throw new BareScoreError("依据不完整（重跑明细/模型族别/解释缺一不可）——分数必须说明怎么来的");
  }
  assertDistinctModelFamily({
    answeringModel: String(derivation.answeringModel),
    reviewerModel: String(derivation.reviewerModel),
  });
  return candidate as BandedScore;
}

/** 注入式重跑评分器：每次调用 = 一次独立评审（生产用真模型，测试用固定夹具，不花钱）。 */
export type RescoreRunner = () => Promise<number>;

export async function collectRescores(runner: RescoreRunner, runs: number = RESCORE_RUNS): Promise<number[]> {
  const rescores: number[] = [];
  for (let attempt = 0; attempt < runs; attempt += 1) {
    const score = await runner();
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new BareScoreError(`第 ${attempt + 1} 次重跑没有返回有效分数——失败的重跑如实报错，不静默补数`);
    }
    rescores.push(score);
  }
  return rescores;
}

/**
 * 把原始 InterviewAssessment（裸 number score）升级为 ScoredInterviewAssessment。
 * needs_more_input 允许 score 为 null（那是「不评分」，不是裸分）；
 * assessed 必须携带已过闸门的 BandedScore。
 */
export function attachBandedScore(
  assessment: InterviewAssessment,
  score: BandedScore | null,
): ScoredInterviewAssessment {
  if (assessment.status === "needs_more_input") {
    if (score !== null) {
      throw new BareScoreError("needs_more_input 的回答不允许携带分数——没有真实可评的回答就不评分");
    }
    return { ...assessment, score: null };
  }
  if (score === null) {
    throw new BareScoreError("assessed 状态却无分数对象——要么给出带区间与依据的分数，要么如实转 needs_more_input");
  }
  const gated = assertScoreShipsWithExplanation(score);
  return { ...assessment, score: gated };
}

/**
 * 前端/其他工作包对接形状（W6 只消费这个）：
 *   assessment.score = {
 *     value: 78,
 *     band: { minus: 2, plus: 3, label: "±3" },
 *     derivation: { explanation: "……", rubricAnchor, workedExampleRefs, evidenceUsed,
 *                   reviewerModel, reviewerFamily, answeringModel, answeringFamily,
 *                   rescores: [76, 78, 81], spread: 5 }
 *   }
 *   或 null（needs_more_input）。渲染分数时旁边必须展示 band.label 与 derivation.explanation。
 */

/** 落库/对前端出网时的扁平形状（components/cockpit/interview-assessment-logic.ts 的读取合同）。 */
export interface ScoredAssessmentWirePayload {
  status: "assessed" | "needs_more_input";
  score: number | null;
  /** ±N（分）。assessed 时必为数字——W6 收到缺失会显示「波动未实测」，那是降级不是常态。 */
  scoreBand?: number;
  /** 分数旁边的依据文案。 */
  scoreBandNote?: string;
  /** 完整推导对象，供回放与深链展示。 */
  scoreDerivation?: ScoreDerivation;
  [key: string]: unknown;
}

/**
 * 把 BandedScore 摊平成 W6 已上岗的读取形状：
 *   scoreBand = max(minus, plus)，scoreBandNote = derivation.explanation。
 * assessed 而缺 band/note 视为缺陷（走 assertScoreShipsWithExplanation 抛错）；
 * score 为 null（needs_more_input）时不携带任何分数字段——不显示分，也不显示带。
 */
export function toScoredAssessmentWirePayload(
  scored: Omit<ScoredInterviewAssessment, "score"> & { score: BandedScore | null },
): ScoredAssessmentWirePayload {
  if (scored.score === null) {
    return { ...scored, score: null };
  }
  const gated = assertScoreShipsWithExplanation(scored.score);
  return {
    ...scored,
    score: gated.value,
    scoreBand: Math.max(gated.band.minus, gated.band.plus),
    scoreBandNote: gated.derivation.explanation,
    scoreDerivation: gated.derivation,
  };
}

// ========== 整轮汇总分（确定性聚合，不再让模型裸报 overallScore） ==========

export interface RoundScoreWire {
  overallScore: number;
  /** 取各题实测波动的最大值——最不稳的一题决定整轮的浮动带。 */
  overallScoreBand: number;
  overallScoreBandNote: string;
  perQuestionScores: Array<{ questionId: string; score: BandedScore }>;
  unscoredQuestionIds: string[];
}

/**
 * 整轮分的 D3 合同：overallScore 由逐题 BandedScore 确定性求平均得出，
 * band 与依据随分数一起出。needs_more_input 的题如实列进 unscored，
 * 不假装它参与了平均——整轮分也只由真实评分聚合。
 */
export function buildRoundScoreWire(
  questionScores: Array<{ questionId: string; score: BandedScore | null }>,
): RoundScoreWire {
  const scored = questionScores.filter((item): item is { questionId: string; score: BandedScore } => item.score !== null);
  const unscored = questionScores.filter((item) => item.score === null).map((item) => item.questionId);
  if (scored.length === 0) {
    throw new BareScoreError("整轮没有任何带区间带依据的单题分数——不能凭空汇总出一个总评分数");
  }
  scored.forEach((item) => assertScoreShipsWithExplanation(item.score));
  const overallScore = Math.round(scored.reduce((sum, item) => sum + item.score.value, 0) / scored.length);
  const overallScoreBand = Math.max(...scored.map((item) => Math.max(item.score.band.minus, item.score.band.plus)));
  const parts = scored.map((item) => `${item.questionId} ${item.score.value}(${item.score.band.label})`).join("，");
  const overallScoreBandNote =
    `整轮分 ${overallScore} 为 ${scored.length} 道已评分题的确定性平均（${parts}）；` +
    `浮动带取各题实测的最大波动 ±${overallScoreBand} 分` +
    (unscored.length > 0 ? `；${unscored.length} 道 needs_more_input 未计入平均（${unscored.join("、")}）` : "") +
    "。";
  return { overallScore, overallScoreBand, overallScoreBandNote, perQuestionScores: scored, unscoredQuestionIds: unscored };
}
