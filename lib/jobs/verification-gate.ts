/**
 * 公司层次核验适配器（FR-9 接线，M4 第二片，只读零成本）。
 *
 * 接在硬筛之后：输入 = 硬筛留下的候选 + 用户目标档位，输出 = 逐条
 * 「保留 / 剔除 / 拿不准」+ 命中字段 + 理由。层次来自离线注入的名录，
 * 零外呼零模型调用——这条链路不会因为核验而花钱。
 *
 * 失败语义按契约的反向走：核验没跑成（名录数据坏了、输入不合规）
 * **不剔除任何岗位**，全部保留并标注未核验。
 *
 * 目标档位从 `coach_claims` 里的偏好记录读（口径见 `tier-intent.ts`）：
 * 传空数组 = 「不限」= 一律保留只标注；传了档位才可能剔除，
 * 而名录查不到的公司仍然一律保留（拿不准就保留，FR-7 同一取向）。
 */
import {
  runVerificationAgent,
  VERIFICATION_DEGRADED_COPY,
  type CompanyTier,
  type VerificationDecision,
  type VerificationInput,
} from "@/lib/coach-harness/subagents/verification";
import {
  createInMemoryIdempotencyStore,
  mainPromptPayloadFor,
  type BudgetSpec,
} from "@/lib/coach-harness/subagents/contract";
import {
  loadCompanyDirectory,
  TIER_LABEL,
  type CompanyDirectoryRecord,
  type CompanyTierDirectoryWithRecords,
  type DirectorySource,
} from "./company-directory";
import type { FilteredJob, GatedJob, HardDimension, RetrievalGateResult } from "./retrieval-gate";
import { tierLabels } from "./tier-intent";

export interface VerifiedJob extends GatedJob {
  companyTier: CompanyTier | null;
  /** 给用户看的层次名；名录没有这条记录时为 null。 */
  tierLabel: string | null;
  tierVerdict: "keep" | "drop" | "unsure";
  /** 命中了名录的哪条规则：给用户的说法要按它分，「没设档位」和「身份没双校验」不是一回事。 */
  tierMatchedField: VerificationDecision["matchedField"];
  /** 每条结论都带理由，供复核。 */
  tierReason: string;
  /** true = 层次结论已可用于取舍；false = 只标注不筛掉。 */
  verified: boolean;
  tierBasis: string | null;
  tierSources: DirectorySource[];
}

export interface VerificationGateResult {
  kept: VerifiedJob[];
  filtered: FilteredJob[];
  pendingProfileFields: HardDimension[];
  status: "ok" | "degraded";
  /** degraded 时的固定话术；正常为 null。 */
  note: string | null;
  directoryVerifiedAt: string | null;
  /** 名录覆盖率如实报：给用户看「这几条里名录只认得这几家」。 */
  coverage: { total: number; inDirectory: number };
}

/** 目标档位由调用方从偏好记录里读出来传进来（面板点选 / 已确认的对话意向）。 */
export interface VerificationGateOptions {
  /** 用户想要的档位；空数组 = 不限，一律保留只标注。 */
  goalTargetTiers?: CompanyTier[];
  /** 注入时钟（ISO）：台账与复核日期用它，不读真实时间。 */
  isoNow: string;
  /** 注入名录（测试与后续换数据源用）；不传则读内置的离线名录。 */
  directory?: CompanyTierDirectoryWithRecords;
}

function budgetFor(keys: string[]): BudgetSpec {
  return {
    maxSourceCalls: 0,
    maxTokens: 0,
    maxWallClockMs: Math.max(1000, keys.length * 5),
    // 幂等键由候选集决定：同一批候选重放拿同一结果；没有持久化存储，跨请求不共享
    idempotencyKey: `jobs-discover:${[...keys].sort().join("|")}`,
  };
}

/** 名录里能给的「为什么是这个层次」与出处；层次名一律从判定结果取，避免两处口径。 */
function recordEvidence(record: CompanyDirectoryRecord | null) {
  return { tierBasis: record?.tierBasis ?? null, tierSources: record?.sources ?? [] };
}

/** 被剔的岗位要回答「为什么少了一条」：这里给档位名，不给 `mid_small` 这种枚举码。 */
function tierDropReason(decision: VerificationDecision, goalTiers: CompanyTier[]): string {
  if (decision.verdict !== "drop" || !decision.companyTier) return decision.reason;
  return `公司层次是「${TIER_LABEL[decision.companyTier]}」，不在你选的目标档位（${tierLabels(goalTiers)}）里`;
}

/** 名录坏了或输入不合规：按契约全部保留 + 标注未核验，绝不静默少岗位。 */
function keepAllUnverified(gate: RetrievalGateResult): VerificationGateResult {
  // 降级时不给任何层次结论：连「这家公司是谁」都不可信了，别再报一个可能错的层次
  return {
    kept: gate.kept.map((job) => ({
      ...job,
      tierLabel: null,
      tierBasis: null,
      tierSources: [],
      companyTier: null,
      tierVerdict: "unsure" as const,
      tierMatchedField: "lookup_miss" as const,
      tierReason: "核验环节没跑成，本条按未核验保留",
      verified: false,
    })),
    filtered: gate.filtered,
    pendingProfileFields: gate.pendingProfileFields,
    status: "degraded" as const,
    note: VERIFICATION_DEGRADED_COPY,
    directoryVerifiedAt: null,
    coverage: { total: gate.kept.length, inDirectory: 0 },
  };
}

export async function applyVerificationGate(
  gate: RetrievalGateResult,
  options: VerificationGateOptions,
): Promise<VerificationGateResult> {
  let directory: CompanyTierDirectoryWithRecords;
  try {
    directory = options.directory ?? loadCompanyDirectory();
  } catch {
    // 名录装载失败时连「这家公司是谁」都答不上，标注退成不认识
    return keepAllUnverified(gate);
  }

  const goalTiers = options.goalTargetTiers ?? [];
  const candidates = gate.kept.map((job) => ({
    dedupeKey: job.dedupeKey,
    company: job.company,
    // 招聘板接口不返回公司域名字段，这里不猜域名：只按名字查，拿不准由名录兜底
    companyDomain: undefined,
    title: job.title,
    location: job.location,
    retrievalOpinion: {
      decision: "keep" as const,
      matchedField: "keyword",
      reason: job.reasons.join("；") || "由关键词命中，检索侧意见为合适",
    },
  }));
  const input: VerificationInput = {
    candidates,
    goal: { targetTiers: goalTiers },
    budget: budgetFor(candidates.map((c) => c.dedupeKey)),
  };

  try {
    const outcome = await runVerificationAgent(input, {
      directory,
      isoNow: options.isoNow,
      idempotency: createInMemoryIdempotencyStore(),
    });
    const payload = mainPromptPayloadFor(outcome);
    // failed 分支拿不到 product，degraded 分支的结论是「一律保留 + 未核验」——
    // 两种情况都不给层次标注：连名录都不可信时，别再报一个可能错的层次
    if (!payload.ok || outcome.status === "degraded") return keepAllUnverified(gate);

    const byKey = new Map(payload.product.decisions.map((d) => [d.dedupeKey, d]));
    const finalKeys = new Set(payload.product.finalKeys);
    const kept: VerifiedJob[] = [];
    const dropped: FilteredJob[] = [];
    for (const job of gate.kept) {
      const decision = byKey.get(job.dedupeKey);
      const record = directory.recordFor(job.company);
      if (!decision || !finalKeys.has(job.dedupeKey)) {
        dropped.push({
          id: job.id,
          company: job.company,
          title: job.title,
          location: job.location,
          url: job.url,
          publishedAt: job.publishedAt,
          reasons: [decision ? tierDropReason(decision, goalTiers) : "核验没有给出结论，先移出上面这批"],
        });
        continue;
      }
      kept.push({
        ...job,
        ...recordEvidence(record),
        companyTier: decision.companyTier,
        tierLabel: decision.companyTier ? TIER_LABEL[decision.companyTier] : null,
        tierVerdict: decision.verdict,
        tierMatchedField: decision.matchedField,
        tierReason: decision.reason,
        verified: decision.verified,
      });
    }
    return {
      kept,
      filtered: [...gate.filtered, ...dropped],
      pendingProfileFields: [...new Set(kept.flatMap((job) => job.pendingProfileFields))],
      status: "ok",
      // 只有核成了才报名录版本；降级与失败都走 keepAllUnverified，那里是 null
      note: null,
      directoryVerifiedAt: directory.verifiedAt,
      coverage: { total: kept.length, inDirectory: kept.filter((job) => job.companyTier !== null).length },
    };
  } catch {
    return keepAllUnverified(gate);
  }
}
