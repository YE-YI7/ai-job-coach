/**
 * 目标公司档位偏好（FR-9 剔除分支的开关）。
 *
 * 口径（郭屹 2026-09-30 裁定）：允许「不限」，但用户只要有档位意向，**无论从哪个渠道拿到**，
 * 都必须被接住并参与判定。所以这里只有一条真源：`coach_claims` 里
 * `entity_type=preference` + `entity_key=target_company_tiers` 的记录，
 * 面板点选、对话原话、求职方向字段全写同一张表，读取只看这一处。
 *
 * 两条纪律：
 * 1. **只认用户自己写给系统的短句**（对话消息、求职方向），不认 JD / 简历 / 宣传文案——
 *    「我们是快速成长的创业公司」是用人方自述，不是用户的档位意向。
 * 2. **抽出来不等于能拿去剔岗位**。别处抽到的意向落成 `unverified` claim，
 *    界面带原话提示、一键确认（或在我的笔记里核对）后才成为生效值；
 *    确认不了就一律保留——与「拿不准就保留」（FR-7）同一取向。
 */
import type { CompanyTier } from "@/lib/coach-harness/subagents/verification";
import { TIER_LABEL } from "./company-directory";

export const TIER_PREFERENCE_KEY = "target_company_tiers";
export const TIER_PREFERENCE_CLAIM_TYPE = "tier_preference";
export const ANY_TIER_LABEL = "不限";
/** 界面上的选项顺序：不限在最前（默认值），其余三档跟名录口径。 */
export const TIER_ORDER: CompanyTier[] = ["big_tech", "mid_small", "non_internet"];

export function isCompanyTier(value: unknown): value is CompanyTier {
  return typeof value === "string" && (TIER_ORDER as string[]).includes(value);
}

/** 给用户看的档位名：一律从名录的层次标签取、按固定顺序排，不在这里维护第二套说法。 */
export function tierLabels(tiers: CompanyTier[]): string {
  const ordered = TIER_ORDER.filter((tier) => tiers.includes(tier));
  return ordered.length ? ordered.map((tier) => TIER_LABEL[tier]).join("、") : ANY_TIER_LABEL;
}

export function sameTierSet(a: CompanyTier[], b: CompanyTier[]): boolean {
  return a.length === b.length && a.every((tier) => b.includes(tier));
}

/** claim.value 只认 `{tiers:[枚举]}`；读不出就返回 null 当没有这条，绝不拿半截数据去筛人。 */
export function tiersFromValue(value: unknown): CompanyTier[] | null {
  const raw = (value as { tiers?: unknown } | null)?.tiers;
  if (!Array.isArray(raw) || !raw.every(isCompanyTier)) return null;
  return TIER_ORDER.filter((tier) => raw.includes(tier));
}

const TIER_VOCAB: Array<{ tier: CompanyTier; pattern: RegExp }> = [
  { tier: "big_tech", pattern: /大厂|大型互联网公司?|头部互联网|头部公司|big[\s-]?tech/i },
  { tier: "mid_small", pattern: /创业公司|创业团队|初创(公司|团队)?|独立融资(的)?(互联网)?(软件)?公司|中小(型)?(互联网)?公司|startup/i },
  { tier: "non_internet", pattern: /非互联网|传统行业|实体行业|制造业|国企|央企|事业单位/ },
];
const POSITIVE = /想(去|进|找|做|投|试试|尝试)|希望(能)?(去|进)|优先考虑|优先选|只(想|去|投|考虑|看)|偏好|倾向|打算去|目标(是进|是去)|looking for|want to (join|work)|prefer/i;
const NEGATIVE = /不想|不去|不看|不投|不要|不考虑|不碰|不感兴趣|没兴趣|排除|避开|别(推荐|介绍|给|发)|no longer|avoid|don'?t (want|like)/i;
/** 「不想去大厂」里的「想去」不能算正面表态：判正面之前先抹掉否定短语。 */
const NEGATIVE_STRIP = /不想|不去|不看|不投|不要|不考虑|不碰|不感兴趣|没兴趣|排除|避开|别(推荐|介绍|给|发)|no longer|avoid|don'?t (want|like)/gi;
const ANY_MENTION = /不限|都可以|都行|都看|都考虑|无所谓|不挑|没有偏好|不设(目标|限制)/;
/** 「都行」出现在别处不算档位表态：必须挨着公司/层次这些词。 */
const TIER_CONTEXT = /公司|层次|档位|规模|平台|大厂|创业|国企|传统行业/;

/**
 * 从用户原话里读档位意向：分句判定立场，取不到立场就不写。
 * 「大厂加班多吗」没有立场词 → null；「不想去大厂，想看看创业公司」→ 只留创业公司。
 */
export function parseTierIntent(text: string): { tiers: CompanyTier[]; excerpt: string } | null {
  const clauses = text.split(/[。！!？?；;\n，,、]+/).map((clause) => clause.trim()).filter((clause) => clause.length > 0 && clause.length <= 200);
  if (!clauses.length) return null;
  const wanted = new Set<CompanyTier>();
  const refused = new Set<CompanyTier>();
  const hits: string[] = [];
  for (const clause of clauses) {
    const mentioned = TIER_VOCAB.filter((entry) => entry.pattern.test(clause)).map((entry) => entry.tier);
    if (!mentioned.length) {
      if (ANY_MENTION.test(clause) && TIER_CONTEXT.test(clause)) return { tiers: [], excerpt: clause };
      continue;
    }
    const positive = POSITIVE.test(clause.replace(NEGATIVE_STRIP, ""));
    const negative = NEGATIVE.test(clause);
    if (positive && !negative) {
      for (const tier of mentioned) wanted.add(tier);
    } else if (negative && !positive) {
      for (const tier of mentioned) refused.add(tier);
    } else if (!positive && !negative && ANY_MENTION.test(clause)) {
      // 「创业公司和大厂都行」= 接受点名的这几档，不是全局不限
      for (const tier of mentioned) wanted.add(tier);
    } else {
      // 两个立场都有 / 都没有 = 读不出用户要什么，这一句丢掉，不猜
      continue;
    }
    hits.push(clause);
  }
  for (const tier of wanted) if (refused.has(tier)) return null;
  const excerpt = hits.join("；").slice(0, 200);
  if (wanted.size) return { tiers: TIER_ORDER.filter((tier) => wanted.has(tier)), excerpt };
  if (refused.size) {
    const tiers = TIER_ORDER.filter((tier) => !refused.has(tier));
    // 三档全排除 = 没有正向依据，宁可不设档位
    if (!tiers.length) return null;
    return { tiers, excerpt };
  }
  return null;
}

export interface TierPreferenceClaimLike {
  id: string;
  entityType: string;
  entityKey: string;
  status: string;
  value: unknown;
  displayText?: string | null;
  sourceExcerpt?: string | null;
  updatedAt?: string | null;
}

export interface TierPreferenceState {
  /** 生效档位：空数组 = 不限（只标注、不剔除）。 */
  effectiveTiers: CompanyTier[];
  /** explicit = 用户确认过的（含点了「不限」）；unset = 还没表过态。 */
  origin: "explicit" | "unset";
  /** 生效那条的原话或点选说明：偏好必须能回查是从哪来的。 */
  sourceExcerpt: string | null;
  claimId: string | null;
  /** 别处抽到、还没确认的意向：界面带原话提示，确认后才参与剔除。 */
  pending: { claimId: string; tiers: CompanyTier[]; excerpt: string } | null;
}

function stamp(value?: string | null): number {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * 读出生效偏好。取值一律「最新的已确认那条」；
 * 未确认的意向只有在**比生效值更新**时才提示，否则是已经被覆盖的旧话。
 */
export function readTierPreference(claims: TierPreferenceClaimLike[]): TierPreferenceState {
  const mine = claims
    .filter((claim) => claim.entityType === "preference" && claim.entityKey === TIER_PREFERENCE_KEY && claim.status !== "withdrawn")
    .map((claim) => ({ claim, tiers: tiersFromValue(claim.value) }))
    .filter((entry): entry is { claim: TierPreferenceClaimLike; tiers: CompanyTier[] } => entry.tiers !== null)
    .sort((a, b) => stamp(b.claim.updatedAt) - stamp(a.claim.updatedAt));
  const confirmed = mine.find((entry) => entry.claim.status === "confirmed");
  // 未确认的意向只在比生效值更新时才算「新话」：更早的那条已经被覆盖，别再提示一遍
  const confirmedAt = confirmed ? stamp(confirmed.claim.updatedAt) : 0;
  const pending = mine.find((entry) => entry.claim.status !== "confirmed" && stamp(entry.claim.updatedAt) > confirmedAt);
  const excerpt = pending ? pending.claim.sourceExcerpt || pending.claim.displayText || "" : "";
  return {
    effectiveTiers: confirmed?.tiers ?? [],
    origin: confirmed ? "explicit" : "unset",
    sourceExcerpt: confirmed ? confirmed.claim.sourceExcerpt || confirmed.claim.displayText || null : null,
    claimId: confirmed?.claim.id ?? null,
    pending: pending ? { claimId: pending.claim.id, tiers: pending.tiers, excerpt } : null,
  };
}
