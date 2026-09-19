/**
 * Offer 对比计算器 · 纯函数计算模块
 *
 * 口径声明（务必与页面文案保持一致）：
 * - 金额单位一律为「元」，内部允许小数，展示层用 round2。
 * - 个税采用「工资薪金月度累计预扣」的简化近似：把 税前月薪×发放月数 摊到 12 个月，
 *   用月度 7 级超额累进税率表 + 速算扣除数（起征点 5000 元）逐月近似计算。
 *   未计专项附加扣除，未做年度汇算清缴。
 * - 年终奖按「全年一次性奖金单独计税」近似：奖金÷12 找月度税率表档位，
 *   税额 = 奖金×税率 − 速算扣除数。
 * - 五险一金个人部分 = 社保基数×(养老8%+医疗2%+失业0.5%) + 社保基数×公积金个人比例，
 *   基数上下限、城市差异一律视为可配置的粗略近似。
 * - 期权/股票：只按用户给的年化税前额并入，不计税、不折现、不模拟归属。
 * - 签字费：只进「首年」口径，不进持续年包。
 * - 时薪 = 年税后到手 ÷（每周工作小时 × 年计薪周数，默认 52）。大小周请用周工时表达。
 * - 所有输出均为估算，以实际账单与当地社保公积金/申报口径为准。
 */

/* ============================
   类型
   ============================ */

export interface SocialRates {
  /** 养老保险个人比例（%），默认 8 */
  pension: number;
  /** 医疗保险个人比例（%），默认 2 */
  medical: number;
  /** 失业保险个人比例（%），默认 0.5 */
  unemployment: number;
}

export const DEFAULT_SOCIAL_RATES: SocialRates = {
  pension: 8,
  medical: 2,
  unemployment: 0.5,
};

export const TAX_THRESHOLD_MONTHLY = 5000;
export const WEEKS_PER_YEAR_DEFAULT = 52;

export interface OfferInput {
  name: string;
  /** 税前月薪（元） */
  monthlySalary: number;
  /** 发放月数，如 12/13/14/16 */
  monthsPaid: number;
  /** 年终奖模式：按月薪倍数 或 固定元额 */
  yearEndBonusMode: 'months' | 'amount';
  /** 月薪的倍数（months 模式）或 固定元额（amount 模式） */
  yearEndBonusValue: number;
  /** 五险一金缴纳基数（元）。建议默认=月薪，允许改；有当地上下限 */
  socialInsuranceBase: number;
  /** 公积金个人比例（%），如 12 */
  housingFundRatePct: number;
  /** 社保各险种个人比例，允许覆盖默认对象 */
  socialRates?: Partial<SocialRates>;
  /** 签字费（元），仅首年计入 */
  signingFee?: number;
  /** 期权/股票年化税前（元/年）。不计税、不折现 */
  equityAnnualPreTax?: number;
  /** 每周工作小时 */
  weeklyHours: number;
  /** 年计薪周数，默认 52 */
  restWeeksPerYear?: number;
  /** 城市标签，仅展示用 */
  cityLabel?: string;
}

export interface OfferMetrics {
  name: string;
  cityLabel: string;
  /** 税前持续年包 = 月薪×发放月数 + 年终奖 + 期权年化（不含签字费） */
  grossAnnualPackage: number;
  /** 首年税前总包 = 持续年包 + 签字费 */
  firstYearGrossPackage: number;
  salaryAnnual: number;
  bonusAnnual: number;
  equityAnnualPreTax: number;
  signingFee: number;
  /** 五险一金个人部分（月） */
  monthlyDeduction: number;
  socialDeductionMonthly: number;
  housingFundDeductionMonthly: number;
  /** 月度摊薄应税工资（月薪×月数÷12） */
  monthlyPreTaxAvg: number;
  /** 月度应纳税所得额（扣五险一金与 5000 起征点后） */
  monthlyTaxable: number;
  /** 月度个税（近似） */
  monthlyTax: number;
  /** 月度税后到手（近似） */
  monthlyNet: number;
  /** 全年工资个税（月度近似×12） */
  annualSalaryTax: number;
  /** 年终奖单独计税（近似） */
  bonusTax: number;
  /** 全年五险一金个人扣除（按 12 个月） */
  annualDeduction: number;
  /** 年度税后到手（含年终奖、期权；不含签字费） */
  annualNet: number;
  /** 税后时薪 */
  hourlyNet: number;
  /** 首年净得 = 年税后到手 + 签字费 */
  firstYearTotalNet: number;
  weeklyHours: number;
  weeksPerYear: number;
}

export interface PairwiseDelta {
  from: number;
  to: number;
  /** to.annualNet − from.annualNet */
  netAnnualDiff: number;
  /** to.firstYearTotalNet − from.firstYearTotalNet */
  firstYearDiff: number;
  /** to.hourlyNet − from.hourlyNet */
  hourlyDiff: number;
  /** 差异归因：年工资/年终奖/期权/五险一金/个税五项之和=netAnnualDiff，加签字费项=firstYearDiff；工时项为 hourlyDiff（元/小时） */
  topDrivers: Array<{ component: string; amount: number }>;
}

export interface CompareResult {
  perOffer: OfferMetrics[];
  best: { byPackage: number; byNet: number; byHourly: number };
  pairwiseDeltas: PairwiseDelta[];
}

/* ============================
   工具函数
   ============================ */

/** 安全数值：非有限数或负数一律归 0（缺字段/负数不产生 NaN） */
export function safeNum(v: number | undefined | null, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n;
}

/** 保留两位小数 */
export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * 月度 7 级超额累进税率表（按月度应纳税所得额，起征点外）。
 * 全年应纳税额 = 月度累进税率表（即年度税率表÷12 的口径）。
 */
const MONTHLY_BRACKETS: Array<{ upTo: number; rate: number; quick: number }> = [
  { upTo: 3000, rate: 0.03, quick: 0 },
  { upTo: 12000, rate: 0.1, quick: 210 },
  { upTo: 25000, rate: 0.2, quick: 1410 },
  { upTo: 35000, rate: 0.25, quick: 2660 },
  { upTo: 55000, rate: 0.3, quick: 4410 },
  { upTo: 80000, rate: 0.35, quick: 7160 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quick: 15160 },
];

/** 对月度应纳税所得额计税；≤0 返回 0 */
export function monthlyTaxOn(taxable: number): { rate: number; quick: number; tax: number } {
  const t = safeNum(taxable);
  if (t <= 0) return { rate: 0, quick: 0, tax: 0 };
  const bracket =
    MONTHLY_BRACKETS.find((b) => t <= b.upTo) ??
    MONTHLY_BRACKETS[MONTHLY_BRACKETS.length - 1];
  const tax = Math.max(0, t * bracket.rate - bracket.quick);
  return { rate: bracket.rate, quick: bracket.quick, tax };
}

/** 全年一次性奖金单独计税近似：奖金÷12 定档，税额 = 奖金×税率 − 速算扣除数 */
export function bonusTaxOn(bonus: number): number {
  const b = safeNum(bonus);
  if (b <= 0) return 0;
  const { rate, quick } = monthlyTaxOn(b / 12);
  return Math.max(0, b * rate - quick);
}

/* ============================
   单 offer 指标
   ============================ */

export function computeOfferMetrics(input: OfferInput): OfferMetrics {
  const monthlySalary = safeNum(input?.monthlySalary);
  const monthsPaid = safeNum(input?.monthsPaid) > 0 ? safeNum(input.monthsPaid) : 12;
  const bonusValue = safeNum(input?.yearEndBonusValue);
  const socialInsuranceBase = safeNum(input?.socialInsuranceBase);
  const housingFundRatePct = safeNum(input?.housingFundRatePct);
  const signingFee = safeNum(input?.signingFee);
  const equityAnnualPreTax = safeNum(input?.equityAnnualPreTax);
  const weeklyHours = safeNum(input?.weeklyHours);
  const weeksInput = safeNum(input?.restWeeksPerYear);
  const weeksPerYear = weeksInput > 0 ? weeksInput : WEEKS_PER_YEAR_DEFAULT;

  const rates: SocialRates = {
    pension: safeNum(input?.socialRates?.pension, DEFAULT_SOCIAL_RATES.pension),
    medical: safeNum(input?.socialRates?.medical, DEFAULT_SOCIAL_RATES.medical),
    unemployment: safeNum(
      input?.socialRates?.unemployment,
      DEFAULT_SOCIAL_RATES.unemployment,
    ),
  };
  // 显式传 0 也视为 0：Partial 覆盖时区分 undefined 与 0
  if (input?.socialRates?.pension === undefined) rates.pension = DEFAULT_SOCIAL_RATES.pension;
  if (input?.socialRates?.medical === undefined) rates.medical = DEFAULT_SOCIAL_RATES.medical;
  if (input?.socialRates?.unemployment === undefined)
    rates.unemployment = DEFAULT_SOCIAL_RATES.unemployment;

  const salaryAnnual = monthlySalary * monthsPaid;
  const bonusAnnual =
    input?.yearEndBonusMode === 'amount' ? bonusValue : monthlySalary * bonusValue;

  const socialDeductionMonthly =
    (socialInsuranceBase * (rates.pension + rates.medical + rates.unemployment)) / 100;
  const housingFundDeductionMonthly = (socialInsuranceBase * housingFundRatePct) / 100;
  const monthlyDeduction = socialDeductionMonthly + housingFundDeductionMonthly;

  // 月度累计预扣的简化：把年度工资摊到 12 个月逐月近似
  const monthlyPreTaxAvg = salaryAnnual / 12;
  const monthlyTaxable = Math.max(
    0,
    monthlyPreTaxAvg - monthlyDeduction - TAX_THRESHOLD_MONTHLY,
  );
  const { tax: monthlyTax } = monthlyTaxOn(monthlyTaxable);
  const monthlyNet = Math.max(0, monthlyPreTaxAvg - monthlyDeduction - monthlyTax);
  const annualSalaryTax = monthlyTax * 12;
  const bonusTax = bonusTaxOn(bonusAnnual);
  const annualDeduction = monthlyDeduction * 12;

  const grossAnnualPackage = salaryAnnual + bonusAnnual + equityAnnualPreTax;
  const firstYearGrossPackage = grossAnnualPackage + signingFee;

  const annualNet = Math.max(
    0,
    monthlyNet * 12 + (bonusAnnual - bonusTax) + equityAnnualPreTax,
  );
  const hourlyNet =
    weeklyHours > 0 ? annualNet / (weeklyHours * weeksPerYear) : 0;
  const firstYearTotalNet = annualNet + signingFee;

  return {
    name: typeof input?.name === 'string' ? input.name : '',
    cityLabel: typeof input?.cityLabel === 'string' ? input.cityLabel : '',
    grossAnnualPackage,
    firstYearGrossPackage,
    salaryAnnual,
    bonusAnnual,
    equityAnnualPreTax,
    signingFee,
    monthlyDeduction,
    socialDeductionMonthly,
    housingFundDeductionMonthly,
    monthlyPreTaxAvg,
    monthlyTaxable,
    monthlyTax,
    monthlyNet,
    annualSalaryTax,
    bonusTax,
    annualDeduction,
    annualNet,
    hourlyNet,
    firstYearTotalNet,
    weeklyHours,
    weeksPerYear,
  };
}

/* ============================
   多 offer 对比
   ============================ */

function indexOfMax(metrics: OfferMetrics[], pick: (m: OfferMetrics) => number): number {
  if (metrics.length === 0) return -1;
  let bestIdx = 0;
  let bestVal = pick(metrics[0]);
  for (let i = 1; i < metrics.length; i += 1) {
    const v = pick(metrics[i]);
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * 归因：把 to−from 的差异拆成可加总分项。
 * 「签字费」「工时」两项之外，其余四项之和 = netAnnualDiff；
 * 加上签字费项 = firstYearDiff；「工时」项的 amount 是 hourlyDiff（元/小时）。
 */
function buildDrivers(from: OfferMetrics, to: OfferMetrics): PairwiseDelta['topDrivers'] {
  const drivers = [
    {
      component: '税前年工资（月薪×发放月数）',
      amount: to.salaryAnnual - from.salaryAnnual,
    },
    { component: '年终奖（税前）', amount: to.bonusAnnual - from.bonusAnnual },
    { component: '期权年化（税前）', amount: to.equityAnnualPreTax - from.equityAnnualPreTax },
    {
      component: '五险一金个人扣除',
      amount: -(to.annualDeduction - from.annualDeduction),
    },
    {
      component: '个税（工资月度近似 + 年终奖）',
      amount: -(
        to.annualSalaryTax + to.bonusTax - (from.annualSalaryTax + from.bonusTax)
      ),
    },
    { component: '签字费（仅首年）', amount: to.signingFee - from.signingFee },
  ];
  if (from.weeklyHours !== to.weeklyHours) {
    drivers.push({
      component: '周工时（元/小时口径的时薪差）',
      amount: to.hourlyNet - from.hourlyNet,
    });
  }
  return drivers
    .filter((d) => Math.abs(d.amount) > 0.005)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map((d) => ({ component: d.component, amount: round2(d.amount) }));
}

export function compareOffers(offers: OfferInput[]): CompareResult {
  const list = Array.isArray(offers) ? offers : [];
  const perOffer = list.map(computeOfferMetrics);

  const best = {
    byPackage: indexOfMax(perOffer, (m) => m.grossAnnualPackage),
    byNet: indexOfMax(perOffer, (m) => m.annualNet),
    byHourly: indexOfMax(perOffer, (m) => m.hourlyNet),
  };

  const pairwiseDeltas: PairwiseDelta[] = [];
  for (let i = 0; i < perOffer.length; i += 1) {
    for (let j = i + 1; j < perOffer.length; j += 1) {
      const from = perOffer[i];
      const to = perOffer[j];
      pairwiseDeltas.push({
        from: i,
        to: j,
        netAnnualDiff: round2(to.annualNet - from.annualNet),
        firstYearDiff: round2(to.firstYearTotalNet - from.firstYearTotalNet),
        hourlyDiff: round2(to.hourlyNet - from.hourlyNet),
        topDrivers: buildDrivers(from, to),
      });
    }
  }

  return { perOffer, best, pairwiseDeltas };
}
