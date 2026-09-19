import {
  DEFAULT_SOCIAL_RATES,
  bonusTaxOn,
  compareOffers,
  computeOfferMetrics,
  monthlyTaxOn,
  round2,
  safeNum,
  type OfferInput,
} from './compare';

const BASE_OFFER: OfferInput = {
  name: '基准',
  monthlySalary: 20000,
  monthsPaid: 12,
  yearEndBonusMode: 'months',
  yearEndBonusValue: 0,
  socialInsuranceBase: 20000,
  housingFundRatePct: 12,
  weeklyHours: 40,
  signingFee: 0,
  equityAnnualPreTax: 0,
};

function makeOffer(overrides: Partial<OfferInput>): OfferInput {
  return { ...BASE_OFFER, ...overrides };
}

/*
 * 手算参考（默认社保 10.5%、公积金 12%）：
 * monthly 30000, base 30000 → 五险一金个人 = 3150 + 3600 = 6750
 * 月度应税 = 30000 − 6750 − 5000 = 18250 → 20% 档：18250×0.2 − 1410 = 2240
 * 月到手 = 30000 − 6750 − 2240 = 21010；年到手 = 252120
 */
describe('monthlyTaxOn / 个税月度近似预扣', () => {
  it('起征点以下不计税', () => {
    expect(monthlyTaxOn(0).tax).toBe(0);
    expect(monthlyTaxOn(-100).tax).toBe(0);
    expect(monthlyTaxOn(3000).tax).toBeCloseTo(90, 6); // 3% 档
  });

  it('跨档：12000 元落在 10% 档并扣速算扣除数', () => {
    const { rate, quick, tax } = monthlyTaxOn(12000);
    expect(rate).toBe(0.1);
    expect(quick).toBe(210);
    expect(tax).toBeCloseTo(990, 6);
  });

  it('跨档：18250 元落在 20% 档', () => {
    expect(monthlyTaxOn(18250).tax).toBeCloseTo(2240, 6);
  });

  it('最高档 45%', () => {
    const { rate, tax } = monthlyTaxOn(100000);
    expect(rate).toBe(0.45);
    expect(tax).toBeCloseTo(100000 * 0.45 - 15160, 6);
  });
});

describe('bonusTaxOn / 年终奖单独计税近似', () => {
  it('50000 元：÷12=4166.7 落 10% 档，税=5000−210', () => {
    expect(bonusTaxOn(50000)).toBeCloseTo(4790, 6);
  });
  it('0 或负数不计税', () => {
    expect(bonusTaxOn(0)).toBe(0);
    expect(bonusTaxOn(-500)).toBe(0);
  });
});

describe('computeOfferMetrics / 年包与税后到手', () => {
  it('月薪×月数 + 20% 档月度预扣 → 年到手 252120、时薪≈96.97', () => {
    const m = computeOfferMetrics(
      makeOffer({ monthlySalary: 30000, socialInsuranceBase: 30000, weeklyHours: 50 }),
    );
    expect(m.grossAnnualPackage).toBeCloseTo(360000, 6);
    expect(m.monthlyDeduction).toBeCloseTo(6750, 6);
    expect(m.monthlyTax).toBeCloseTo(2240, 6);
    expect(m.monthlyNet).toBeCloseTo(21010, 6);
    expect(m.annualNet).toBeCloseTo(252120, 6);
    expect(round2(m.hourlyNet)).toBe(96.97); // 252120 / (50×52) = 96.9692...
    expect(m.firstYearTotalNet).toBeCloseTo(252120, 6); // 无签字费时相等
  });

  it('16 薪 + 2 个月年终奖（months 模式）计入年包', () => {
    const m = computeOfferMetrics(
      makeOffer({
        monthlySalary: 20000,
        monthsPaid: 16,
        yearEndBonusMode: 'months',
        yearEndBonusValue: 2,
        socialInsuranceBase: 12000,
        housingFundRatePct: 7,
      }),
    );
    expect(m.salaryAnnual).toBeCloseTo(320000, 6);
    expect(m.bonusAnnual).toBeCloseTo(40000, 6);
    expect(m.grossAnnualPackage).toBeCloseTo(360000, 6);
    expect(m.annualDeduction).toBeCloseTo((12000 * 0.105 + 12000 * 0.07) * 12, 6);
  });

  it('amount 模式年终奖固定 50000，单独计税 4790', () => {
    const m = computeOfferMetrics(
      makeOffer({ yearEndBonusMode: 'amount', yearEndBonusValue: 50000 }),
    );
    expect(m.bonusAnnual).toBeCloseTo(50000, 6);
    expect(m.bonusTax).toBeCloseTo(4790, 6);
    // 年到手 = 工资净 + (50000 − 4790)
    const salaryNet = m.monthlyNet * 12;
    expect(m.annualNet).toBeCloseTo(salaryNet + 45210, 6);
  });

  it('期权年化不计税直接进年包与到手；签字费只进首年口径', () => {
    const m = computeOfferMetrics(
      makeOffer({ signingFee: 60000, equityAnnualPreTax: 100000 }),
    );
    expect(m.grossAnnualPackage).toBeCloseTo(340000, 6); // 240000 工资 + 100000 期权，不含签字费
    expect(m.firstYearGrossPackage).toBeCloseTo(400000, 6); // 含签字费
    const noEquity = computeOfferMetrics(makeOffer({}));
    expect(m.annualNet - noEquity.annualNet).toBeCloseTo(100000, 6); // 期权不计税
    expect(m.firstYearTotalNet - m.annualNet).toBeCloseTo(60000, 6); // 签字费仅首年
  });

  it('大小周用周工时体现：6 天 48h 时薪低于 5 天 40h', () => {
    const base = { annual: computeOfferMetrics(makeOffer({ weeklyHours: 40 })) };
    const six = computeOfferMetrics(makeOffer({ weeklyHours: 48 }));
    expect(six.annualNet).toBeCloseTo(base.annual.annualNet, 6);
    expect(six.hourlyNet).toBeLessThan(base.annual.hourlyNet);
    expect(base.annual.hourlyNet).toBeCloseTo(six.hourlyNet * (48 / 40), 6);
  });

  it('可覆盖社保比例；显式 0 也生效', () => {
    const zero = computeOfferMetrics(
      makeOffer({ socialRates: { pension: 0, medical: 0, unemployment: 0 } }),
    );
    expect(zero.socialDeductionMonthly).toBe(0);
    expect(zero.housingFundDeductionMonthly).toBeCloseTo(2400, 6);
    expect(DEFAULT_SOCIAL_RATES.pension).toBe(8);
  });

  it('边界：0/负数/NaN/缺字段不产生 NaN；weeklyHours=0 时薪为 0', () => {
    const m = computeOfferMetrics({
      name: '坏输入',
      monthlySalary: NaN,
      monthsPaid: -3,
      yearEndBonusMode: 'months',
      yearEndBonusValue: -2,
      socialInsuranceBase: 0,
      housingFundRatePct: -12,
      signingFee: NaN,
      equityAnnualPreTax: undefined,
      weeklyHours: 0,
    } as OfferInput);
    for (const [key, value] of Object.entries(m)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(value).not.toBeNaN();
      void key;
    }
    expect(m.hourlyNet).toBe(0);
    // monthsPaid≤0 回落为 12 个月口径
    expect(m.monthlyPreTaxAvg).toBe(0);
  });
});

describe('compareOffers / best 与 pairwise 归因', () => {
  const offers: OfferInput[] = [
    makeOffer({
      name: 'A 大厂',
      monthlySalary: 30000,
      socialInsuranceBase: 30000,
      weeklyHours: 50,
      signingFee: 0,
      equityAnnualPreTax: 30000,
    }),
    makeOffer({
      name: 'B 中厂',
      monthlySalary: 32000,
      socialInsuranceBase: 10000,
      housingFundRatePct: 5,
      weeklyHours: 42,
      signingFee: 80000,
      yearEndBonusMode: 'amount',
      yearEndBonusValue: 30000,
    }),
  ];
  const result = compareOffers(offers);

  it('空列表安全返回', () => {
    const empty = compareOffers([]);
    expect(empty.perOffer).toEqual([]);
    expect(empty.best).toEqual({ byPackage: -1, byNet: -1, byHourly: -1 });
    expect(empty.pairwiseDeltas).toEqual([]);
  });

  it('best 索引指向正确 offer', () => {
    const { perOffer, best } = result;
    expect(best.byPackage).toBe(
      perOffer.reduce((bi, m, i, arr) => (m.grossAnnualPackage > arr[bi].grossAnnualPackage ? i : bi), 0),
    );
    expect(best.byNet).toBe(
      perOffer.reduce((bi, m, i, arr) => (m.annualNet > arr[bi].annualNet ? i : bi), 0),
    );
    expect(best.byHourly).toBe(
      perOffer.reduce((bi, m, i, arr) => (m.hourlyNet > arr[bi].hourlyNet ? i : bi), 0),
    );
  });

  it('pairwise 差额与 metrics 一致；topDrivers 非签字费/工时项之和 = netAnnualDiff', () => {
    expect(result.pairwiseDeltas).toHaveLength(1);
    const delta = result.pairwiseDeltas[0];
    const [a, b] = result.perOffer;
    expect(delta.netAnnualDiff).toBe(round2(b.annualNet - a.annualNet));
    expect(delta.firstYearDiff).toBe(round2(b.firstYearTotalNet - a.firstYearTotalNet));
    expect(delta.hourlyDiff).toBe(round2(b.hourlyNet - a.hourlyNet));

    const coreSum = delta.topDrivers
      .filter(
        (d) => !d.component.includes('签字费') && !d.component.includes('工时'),
      )
      .reduce((s, d) => s + d.amount, 0);
    expect(coreSum).toBeCloseTo(b.annualNet - a.annualNet, 1);

    const signing =
      delta.topDrivers.find((d) => d.component.includes('签字费'))?.amount ?? 0;
    expect(coreSum + signing).toBeCloseTo(b.firstYearTotalNet - a.firstYearTotalNet, 1);

    // B 工资更高且社保公积金扣得更少 → 归因里应出现这两项
    expect(delta.topDrivers.some((d) => d.component.includes('五险一金'))).toBe(true);
    expect(delta.topDrivers.some((d) => d.component.includes('税前年工资'))).toBe(true);
  });

  it('两个 offer 数字完全相同时无虚假差异', () => {
    const twin = compareOffers([makeOffer({ name: 'X' }), makeOffer({ name: 'Y' })]);
    const d = twin.pairwiseDeltas[0];
    expect(d.netAnnualDiff).toBe(0);
    expect(d.firstYearDiff).toBe(0);
    expect(d.hourlyDiff).toBe(0);
    expect(d.topDrivers).toEqual([]);
  });
});

describe('safeNum / round2', () => {
  it('负数与非法值归 0，round2 处理非有限数', () => {
    expect(safeNum(-5)).toBe(0);
    expect(safeNum(undefined, 3)).toBe(3);
    expect(safeNum('abc' as unknown as number)).toBe(0);
    expect(round2(1234.567)).toBe(1234.57);
    expect(round2(Number.NaN)).toBe(0);
  });
});
