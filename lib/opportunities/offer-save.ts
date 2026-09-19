/**
 * 「保存 offer 对比到作战盘」的纯校验 + 组装模块（无 I/O，可单测）。
 *
 * 输入是 offer 对比器的原始 body；输出是一个 `Omit<Opportunity, "id">`，
 * 其中 workspaceType = "offer"、offerComparison 携带每个 offer 的输入回显与
 * lib/offer/compare 的计算结果摘要。仓储层（createCockpitOpportunity）会把
 * offerComparison 塞进 metadata jsonb 往返，无需迁移。
 */
import {
  computeOfferMetrics,
  round2,
  WEEKS_PER_YEAR_DEFAULT,
  type OfferInput,
} from "@/lib/offer/compare";
import type { OfferComparison, OfferSnapshot, Opportunity } from "./types";

export const MAX_OFFERS = 3;
export const MAX_BODY_CHARS = 64 * 1024;

const LIMITS = {
  name: 80,
  cityLabel: 40,
  note: 2000,
  company: 120,
  role: 160,
  monthlySalary: 2_000_000,
  monthsPaid: 48,
  weeklyHours: 168,
  socialInsuranceBase: 2_000_000,
  housingFundRatePct: 30,
  bonusMonths: 36,
  bonusAmount: 5_000_000,
  signingFee: 5_000_000,
  equityAnnualPreTax: 100_000_000,
} as const;

export type BuildOfferOpportunityResult =
  | { ok: true; opportunity: Omit<Opportunity, "id">; offerComparison: OfferComparison }
  | { ok: false; error: string };

type Reject = { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 必填字符串：类型/非空/超长都拒绝，返回 trim 后的值 */
function requireString(value: unknown, label: string, maxLen: number): string | Reject {
  if (typeof value !== "string") return { ok: false, error: `${label} 必须是字符串` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: `${label} 不能为空` };
  if (trimmed.length > maxLen) return { ok: false, error: `${label} 超过 ${maxLen} 字上限` };
  return trimmed;
}

/** 数值：允许缺省（走安全默认），提供则必须是有限数且落在 (min, max] 内 */
function numberField(
  value: unknown,
  label: string,
  fallback: number,
  min: number,
  max: number,
): number | Reject {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${label} 必须是有限数值` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `${label} 超出允许范围 [${min}, ${max}]` };
  }
  return value;
}

function reject(result: { ok: false; error: string }): Reject {
  return result;
}

function isErr(value: unknown): value is Reject {
  return typeof value === "object" && value !== null && (value as Reject).ok === false;
}

function buildOfferSnapshot(raw: unknown, index: number): OfferSnapshot | Reject {
  const label = `offers[${index}]`;
  if (!isRecord(raw)) return { ok: false, error: `${label} 必须是对象` };

  const name = requireString(raw.name, `${label}.name`, LIMITS.name);
  if (isErr(name)) return reject(name);

  const monthlySalary = numberField(raw.monthlySalary, `${label}.monthlySalary`, NaN, 0, LIMITS.monthlySalary);
  if (isErr(monthlySalary)) return reject(monthlySalary);
  if (Number.isNaN(monthlySalary)) return { ok: false, error: `${label}.monthlySalary 必填` };

  const weeklyHours = numberField(raw.weeklyHours, `${label}.weeklyHours`, NaN, 1, LIMITS.weeklyHours);
  if (isErr(weeklyHours)) return reject(weeklyHours);
  if (Number.isNaN(weeklyHours)) return { ok: false, error: `${label}.weeklyHours 必填` };

  const monthsPaid = numberField(raw.monthsPaid, `${label}.monthsPaid`, 12, 1, LIMITS.monthsPaid);
  if (isErr(monthsPaid)) return reject(monthsPaid);

  let mode: "months" | "amount" = "months";
  const rawMode = raw.yearEndBonusMode;
  if (rawMode !== undefined && rawMode !== null) {
    if (rawMode === "months" || rawMode === "amount") {
      mode = rawMode;
    } else {
      return { ok: false, error: `${label}.yearEndBonusMode 只能是 months 或 amount` };
    }
  }
  const bonusValue = numberField(
    raw.yearEndBonusValue,
    `${label}.yearEndBonusValue`,
    0,
    0,
    mode === "months" ? LIMITS.bonusMonths : LIMITS.bonusAmount,
  );
  if (isErr(bonusValue)) return reject(bonusValue);

  const socialInsuranceBase = numberField(raw.socialInsuranceBase, `${label}.socialInsuranceBase`, monthlySalary, 0, LIMITS.socialInsuranceBase);
  if (isErr(socialInsuranceBase)) return reject(socialInsuranceBase);

  const housingFundRatePct = numberField(raw.housingFundRatePct, `${label}.housingFundRatePct`, 0, 0, LIMITS.housingFundRatePct);
  if (isErr(housingFundRatePct)) return reject(housingFundRatePct);

  const signingFee = numberField(raw.signingFee, `${label}.signingFee`, 0, 0, LIMITS.signingFee);
  if (isErr(signingFee)) return reject(signingFee);

  const equityAnnualPreTax = numberField(raw.equityAnnualPreTax, `${label}.equityAnnualPreTax`, 0, 0, LIMITS.equityAnnualPreTax);
  if (isErr(equityAnnualPreTax)) return reject(equityAnnualPreTax);

  const restWeeksPerYear = numberField(raw.restWeeksPerYear, `${label}.restWeeksPerYear`, WEEKS_PER_YEAR_DEFAULT, 1, WEEKS_PER_YEAR_DEFAULT);
  if (isErr(restWeeksPerYear)) return reject(restWeeksPerYear);

  let cityLabel: string | undefined;
  if (raw.cityLabel !== undefined && raw.cityLabel !== null) {
    const parsed = requireString(raw.cityLabel, `${label}.cityLabel`, LIMITS.cityLabel);
    if (isErr(parsed)) return reject(parsed);
    cityLabel = parsed;
  }

  const input: OfferInput = {
    name,
    monthlySalary,
    monthsPaid,
    yearEndBonusMode: mode,
    yearEndBonusValue: bonusValue,
    socialInsuranceBase,
    housingFundRatePct,
    signingFee,
    equityAnnualPreTax,
    weeklyHours,
    restWeeksPerYear,
    ...(cityLabel ? { cityLabel } : {}),
  };
  const metrics = computeOfferMetrics(input);
  const yearEndBonus = mode === "amount" ? bonusValue : monthlySalary * bonusValue;

  return {
    name,
    ...(cityLabel ? { cityLabel } : {}),
    monthlySalary,
    monthsPaid,
    yearEndBonus: round2(yearEndBonus),
    signingFee,
    equityAnnualPreTax,
    weeklyHours,
    computed: {
      grossAnnualPackage: round2(metrics.grossAnnualPackage),
      firstYearGrossPackage: round2(metrics.firstYearGrossPackage),
      monthlyNet: round2(metrics.monthlyNet),
      annualSalaryTax: round2(metrics.annualSalaryTax),
      bonusTax: round2(metrics.bonusTax),
      annualDeduction: round2(metrics.annualDeduction),
      annualNet: round2(metrics.annualNet),
      hourlyNet: round2(metrics.hourlyNet),
      firstYearTotalNet: round2(metrics.firstYearTotalNet),
    },
  };
}

/**
 * 校验原始 body 并组装成可交给 createCockpitOpportunity 的档案。
 * `nowIso` 由调用方注入，便于测试断言 computedAt。
 */
export function buildOfferOpportunity(
  body: unknown,
  nowIso: string,
): BuildOfferOpportunityResult {
  if (!isRecord(body)) return { ok: false, error: "请求体必须是 JSON 对象" };

  const rawOffers = body.offers;
  if (!Array.isArray(rawOffers)) return { ok: false, error: "offers 必须是数组" };
  if (rawOffers.length < 1) return { ok: false, error: "至少需要 1 个 offer" };
  if (rawOffers.length > MAX_OFFERS) return { ok: false, error: `最多对比 ${MAX_OFFERS} 个 offer` };

  const snapshots: OfferSnapshot[] = [];
  for (let index = 0; index < rawOffers.length; index += 1) {
    const snapshot = buildOfferSnapshot(rawOffers[index], index);
    if (isErr(snapshot)) return reject(snapshot);
    snapshots.push(snapshot);
  }

  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    const parsed = requireString(body.note, "note", LIMITS.note);
    if (isErr(parsed)) return reject(parsed);
    note = parsed;
  }

  // company/role 可缺省：company 回退到首个 offer 名，role 回退为「Offer 对比」；超长截断而非拒绝。
  let company = snapshots[0].name;
  if (typeof body.company === "string" && body.company.trim()) {
    company = body.company.trim().slice(0, LIMITS.company);
  } else if (body.company !== undefined && body.company !== null && typeof body.company !== "string") {
    return { ok: false, error: "company 必须是字符串" };
  }
  let role = "Offer 对比";
  if (typeof body.role === "string" && body.role.trim()) {
    role = body.role.trim().slice(0, LIMITS.role);
  } else if (body.role !== undefined && body.role !== null && typeof body.role !== "string") {
    return { ok: false, error: "role 必须是字符串" };
  }

  const offerComparison: OfferComparison = {
    offers: snapshots,
    computedAt: nowIso,
    ...(note ? { note } : {}),
  };

  const opportunity: Omit<Opportunity, "id"> = {
    workspaceType: "offer",
    offerComparison,
    company,
    role,
    location: "",
    stage: "negotiating",
    stageLabel: "Offer 决策",
    priority: "medium",
    sourceLabel: "Offer 对比器",
    capturedAtLabel: "已同步",
    nextEventLabel: null,
    recommendation: "prepare_then_apply",
    recommendationLabel: "对比后决策",
    recommendationReason: "Offer 对比已保存到作战盘，等待结合意向与谈判进展做最终决策。",
    evidenceCoverage: { strong: 0, weak: 0, missing: 0, unverified: 0 },
    requirements: [],
    actions: [],
    activities: [],
    resumeChanges: [],
    interviewFocus: [],
  };

  return { ok: true, opportunity, offerComparison };
}
