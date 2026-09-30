/**
 * 核验子 Agent（verification）。PRD FR-9 + 契约表第二行：
 * 输入 = 检索结果 + 用户目标与偏好（结构化字段）；
 * 输出 = 保留/剔除 + 理由（公司层次、目标匹配度），每条结论带命中字段与理由；
 * 拿不准就保留 —— 筛选器砍错一次的代价高于少召回一次（FR-7 同一取向）。
 *
 * 失败语义与其他 Agent 相反：核验没跑成 **不剔除任何岗位**，全部保留并标注
 * 「未核验」，走 degraded 分支（降级产物是契约里明确约定过的，不是半成品）。
 *
 * 冲突规则（§5.5 / FR-9 + 决策层 FR-40 的确定性兜底）：核验是判定层，
 * 检索的硬筛是规则层；两边不一致时以规则层为准，冲突记进台账。
 *
 * 公司层次来自注入的离线名录（不触网、不调模型）；名录查不到 = 拿不准 = 保留。
 */
import {
  arbitrate,
  assertStructuredInput,
  createInMemoryIdempotencyStore,
  type BudgetSpec,
  type ConflictRecord,
  type FanOutQuote,
  type IdempotencyStore,
  type OpinionVerdict,
  type RuleVerdict,
  type SubAgentOutcome,
} from "./contract";
import type { ScoredJob } from "./retrieval";

export type CompanyTier = "big_tech" | "mid_small" | "non_internet";

export interface CompanyDirectoryEntry {
  name: string;
  domain: string;
  tier: CompanyTier;
  /** 名录里已确认同名/子公司关系；ambiguous 一律不给合并结论。 */
  identityConfirmed?: boolean;
}

export interface CompanyTierDirectory {
  lookup(name: string, domain?: string): CompanyDirectoryEntry | null;
}

export interface VerificationInput {
  /** 只收检索产物里核验所需的最小结构，收不到 URL 之外的页面原文。 */
  candidates: Array<{
    dedupeKey: string;
    company: string;
    companyDomain?: string;
    title: string;
    location: string;
    /** 检索侧的软推荐意见（它说合适）；与名录层次判定冲突时规则层为准。 */
    retrievalOpinion: { decision: "keep"; matchedField: string; reason: string };
  }>;
  goal: {
    /** 用户想进的档位；空数组 = 不设目标，一律保留。 */
    targetTiers: CompanyTier[];
    /** 结构化偏好字段（枚举值），不是自由文本对话。 */
    avoidIndustries?: string[];
  };
  budget: BudgetSpec;
}

export interface VerificationDecision {
  dedupeKey: string;
  /** keep / drop / unsure（拿不准就保留）。 */
  verdict: "keep" | "drop" | "unsure";
  /** 每条结论都带命中字段与理由供复核。 */
  matchedField: "company_tier_directory" | "target_tiers_empty" | "identity_unconfirmed" | "lookup_miss";
  reason: string;
  companyTier: CompanyTier | null;
  verified: boolean;
}

export interface VerificationProduct {
  decisions: VerificationDecision[];
  /** 与规则层冲突的记录：以规则层为准，逐条落台账供复盘。 */
  conflicts: ConflictRecord[];
  /** 最终集合 = 规则层裁决过、冲突已消解后的结果。 */
  finalKeys: string[];
}

export const VERIFICATION_DEGRADED_COPY = "核验没跑成，候选岗位全部保留并标注未核验。";
export const VERIFICATION_FAILURE_COPY = "核验没跑成，先按规则层结果给你保留全部候选。";

function degradedKeep(candidate: VerificationInput["candidates"][number]): VerificationDecision {
  return {
    dedupeKey: candidate.dedupeKey,
    verdict: "keep",
    matchedField: "lookup_miss",
    reason: "核验环节异常，按契约全部保留并标注未核验",
    companyTier: null,
    verified: false,
  };
}

export function quoteVerificationFanOut(input: VerificationInput): FanOutQuote {
  return {
    billingUnits: 0,
    plannedSourceCalls: 0,
    estimatedTokens: 0,
    estimatedWallClockMs: input.candidates.length * 5,
    rationale: `核验只查离线名录，${input.candidates.length} 条候选，零外呼零模型调用`,
  };
}

export interface VerificationDeps {
  directory: CompanyTierDirectory;
  isoNow: string;
  idempotency?: IdempotencyStore<SubAgentOutcome<VerificationProduct>>;
}

export async function runVerificationAgent(
  input: VerificationInput,
  deps: VerificationDeps,
): Promise<SubAgentOutcome<VerificationProduct>> {
  assertStructuredInput(input);
  const store = deps.idempotency ?? createInMemoryIdempotencyStore<SubAgentOutcome<VerificationProduct>>();
  const cached = store.get(input.budget.idempotencyKey);
  if (cached) return cached;

  const quote = quoteVerificationFanOut(input);
  const usage = {
    billingUnits: quote.billingUnits,
    sourceCalls: 0,
    tokens: 0,
    wallClockMs: quote.estimatedWallClockMs,
    budget: input.budget,
  };

  let outcome: SubAgentOutcome<VerificationProduct>;
  try {
    const decisions: VerificationDecision[] = [];
    const conflicts: ConflictRecord[] = [];
    const finalKeys: string[] = [];

    for (const candidate of input.candidates) {
      const entry = deps.directory.lookup(candidate.company, candidate.companyDomain);
      let decision: VerificationDecision;
      if (!entry) {
        decision = {
          dedupeKey: candidate.dedupeKey,
          verdict: "unsure",
          matchedField: "lookup_miss",
          reason: `名录里没有「${candidate.company}」的层次记录，拿不准就保留`,
          companyTier: null,
          verified: false,
        };
      } else if (entry.identityConfirmed !== true) {
        decision = {
          dedupeKey: candidate.dedupeKey,
          verdict: "unsure",
          matchedField: "identity_unconfirmed",
          reason: `名录记录的公司身份未双校验（${entry.name}/${entry.domain}），保留待核实`,
          companyTier: entry.tier,
          verified: false,
        };
      } else if (input.goal.targetTiers.length === 0) {
        // 没设目标档位 = 没有取舍依据。合同注释与 matchedField 枚举都写了「一律保留」，
        // 之前实现漏了这条分支：空数组会让 includes() 恒假，把名录里查得到的公司全删掉。
        decision = {
          dedupeKey: candidate.dedupeKey,
          verdict: "keep",
          matchedField: "target_tiers_empty",
          reason: `没有设定目标公司档位，一律保留（名录层次：${entry.tier}）`,
          companyTier: entry.tier,
          verified: false,
        };
      } else if (input.goal.targetTiers.includes(entry.tier)) {
        decision = {
          dedupeKey: candidate.dedupeKey,
          verdict: "keep",
          matchedField: "company_tier_directory",
          reason: `公司层次 ${entry.tier} 命中用户目标档位`,
          companyTier: entry.tier,
          verified: true,
        };
      } else {
        decision = {
          dedupeKey: candidate.dedupeKey,
          verdict: "drop",
          matchedField: "company_tier_directory",
          reason: `公司层次 ${entry.tier} 不在用户目标档位 ${input.goal.targetTiers.join("/")} 内`,
          companyTier: entry.tier,
          verified: true,
        };
      }
      decisions.push(decision);

      // 冲突仲裁（§5.5 / FR-9）：核验的名录判定是确定性规则层，
      // 检索的软推荐是意见层；两边不一致时规则层为准并记台账。
      const rule: RuleVerdict = {
        dedupeKey: candidate.dedupeKey,
        decision: decision.verdict === "drop" ? "drop" : "keep",
        ruleId: "company_tier_directory",
        basis: decision.reason,
      };
      const opinion: OpinionVerdict = {
        dedupeKey: candidate.dedupeKey,
        decision: candidate.retrievalOpinion.decision,
        matchedField: candidate.retrievalOpinion.matchedField,
        reason: candidate.retrievalOpinion.reason,
      };
      const arbitrated = arbitrate(rule, opinion, deps.isoNow);
      if (arbitrated.conflict) conflicts.push(arbitrated.conflict);
      if (arbitrated.decision === "keep") finalKeys.push(candidate.dedupeKey);
    }

    outcome = {
      status: "ok",
      idempotencyKey: input.budget.idempotencyKey,
      usage,
      product: { decisions, conflicts, finalKeys },
    };
  } catch (error) {
    // 核验坏了：全部保留 + 标注未核验。degraded 的 product 是契约约定的降级形状。
    const keepAll: VerificationDecision[] = input.candidates.map(degradedKeep);
    outcome = {
      status: "degraded",
      idempotencyKey: input.budget.idempotencyKey,
      usage,
      product: {
        decisions: keepAll,
        conflicts: [],
        finalKeys: input.candidates.map((c) => c.dedupeKey),
      },
      degradation: { what: "verification_source_error", userCopy: VERIFICATION_DEGRADED_COPY },
    };
    void error;
  }
  store.set(input.budget.idempotencyKey, outcome);
  return outcome;
}

/** 从检索产物直接构造核验输入：规则层轨迹随行，冲突仲裁不用回头再查。 */
export function toVerificationInput(
  jobs: ScoredJob[],
  goal: VerificationInput["goal"],
  budget: BudgetSpec,
): VerificationInput {
  return {
    candidates: jobs.map((job) => ({
      dedupeKey: job.dedupeKey,
      company: job.company,
      companyDomain: undefined,
      title: job.title,
      location: job.location,
      retrievalOpinion: {
        decision: "keep" as const,
        matchedField: job.soft[0]?.matchedField ?? "keyword",
        reason: job.soft[0]?.reason ?? "由关键词命中，检索侧意见为合适",
      },
    })),
    goal,
    budget,
  };
}
