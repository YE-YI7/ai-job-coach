import {
  MAX_OFFERS,
  buildOfferOpportunity,
} from "./offer-save";
import type { OpportunityStage } from "./types";

const NOW = "2026-08-01T08:00:00.000Z";

const VALID_STAGES: OpportunityStage[] = [
  "captured", "evaluating", "preparing_application", "applied", "interviewing",
  "negotiating", "won", "lost", "withdrawn", "archived",
];

function baseOffer(overrides: Record<string, unknown> = {}) {
  return {
    name: "字节跳动 PM",
    monthlySalary: 30000,
    monthsPaid: 15,
    yearEndBonusMode: "months",
    yearEndBonusValue: 2,
    socialInsuranceBase: 30000,
    housingFundRatePct: 12,
    signingFee: 50000,
    equityAnnualPreTax: 60000,
    weeklyHours: 50,
    cityLabel: "北京",
    ...overrides,
  };
}

describe("buildOfferOpportunity 合法输入", () => {
  test("3 个 offer：workspaceType/stage/offerComparison 组装正确", () => {
    const result = buildOfferOpportunity({
      company: " 我的目标 ",
      offers: [baseOffer(), baseOffer({ name: "美团 PM", weeklyHours: 45 }), baseOffer({ name: "快手 PM", monthlySalary: 28000 })],
      note: "更看重成长空间",
    }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opportunity.workspaceType).toBe("offer");
    expect(VALID_STAGES).toContain(result.opportunity.stage);
    expect(result.opportunity.stageLabel).toBe("Offer 决策");
    expect(result.opportunity.company).toBe("我的目标");
    expect(result.offerComparison.computedAt).toBe(NOW);
    expect(result.offerComparison.note).toBe("更看重成长空间");
    expect(result.offerComparison.offers).toHaveLength(3);
    expect(result.offerComparison.offers.map((offer) => offer.name)).toEqual(["字节跳动 PM", "美团 PM", "快手 PM"]);
    // 必填数组字段给空数组、证据覆盖给 0
    expect(result.opportunity.requirements).toEqual([]);
    expect(result.opportunity.actions).toEqual([]);
    expect(result.opportunity.activities).toEqual([]);
    expect(result.opportunity.resumeChanges).toEqual([]);
    expect(result.opportunity.interviewFocus).toEqual([]);
    expect(result.opportunity.evidenceCoverage).toEqual({ strong: 0, weak: 0, missing: 0, unverified: 0 });
  });

  test("years 口径：months 模式年终奖折算为元、计算摘要与 compareOffer 一致且裁剪到 2 位", () => {
    const result = buildOfferOpportunity({ offers: [baseOffer({ monthlySalary: 30001.234, yearEndBonusValue: 2 })] }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.offerComparison.offers[0];
    expect(snapshot.yearEndBonus).toBeCloseTo(30001.234 * 2, 2);
    expect(snapshot.monthlySalary).toBe(30001.234);
    for (const value of Object.values(snapshot.computed)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-6); // round2 裁剪
    }
    // grossAnnualPackage = 月薪×月数 + 年终奖 + 期权年化（不含签字费）
    expect(snapshot.computed.grossAnnualPackage).toBeCloseTo(30001.234 * 15 + 30001.234 * 2 + 60000, 1);
    expect(snapshot.computed.firstYearTotalNet).toBeGreaterThan(snapshot.computed.annualNet);
  });

  test("amount 模式年终奖按元计入", () => {
    const result = buildOfferOpportunity({ offers: [baseOffer({ yearEndBonusMode: "amount", yearEndBonusValue: 88000 })] }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offerComparison.offers[0].yearEndBonus).toBe(88000);
  });

  test("缺省字段走安全默认：monthsPaid=12、社保基数=月薪、公积金=0、签字费/期权=0；company/role 有回退", () => {
    const result = buildOfferOpportunity({
      offers: [{ name: "Only Salary", monthlySalary: 20000, weeklyHours: 40 }],
    }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.offerComparison.offers[0];
    expect(snapshot.monthsPaid).toBe(12);
    expect(snapshot.yearEndBonus).toBe(0);
    expect(snapshot.signingFee).toBe(0);
    expect(snapshot.equityAnnualPreTax).toBe(0);
    expect(result.opportunity.company).toBe("Only Salary");
    expect(result.opportunity.role).toBe("Offer 对比");
    expect(result.offerComparison.note).toBeUndefined();
  });

  test("company 超长被截断到 120 字", () => {
    const result = buildOfferOpportunity({
      company: "公".repeat(200),
      offers: [baseOffer()],
    }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opportunity.company.length).toBe(120);
  });
});

describe("buildOfferOpportunity 非法输入", () => {
  const rejects = [
    ["非对象 body", "oops" as unknown],
    ["offers 不是数组", { offers: "x" }],
    ["offers 为空数组", { offers: [] }],
    [`offers 超过 ${MAX_OFFERS} 个`, { offers: [baseOffer(), baseOffer({ name: "B" }), baseOffer({ name: "C" }), baseOffer({ name: "D" })] }],
    ["缺 name", { offers: [{ monthlySalary: 100, weeklyHours: 40 }] }],
    ["缺 monthlySalary", { offers: [{ name: "A", weeklyHours: 40 }] }],
    ["负数月薪", { offers: [baseOffer({ monthlySalary: -1 })] }],
    ["负数周工时", { offers: [baseOffer({ weeklyHours: -5 })] }],
    ["月薪超上限", { offers: [baseOffer({ monthlySalary: 9_999_999 })] }],
    ["非有限数", { offers: [baseOffer({ monthlySalary: "30000" })] }],
    ["offer 名超长", { offers: [baseOffer({ name: "n".repeat(200) })] }],
    ["note 超长", { offers: [baseOffer()], note: "字".repeat(2001) }],
    ["非法 yearEndBonusMode", { offers: [baseOffer({ yearEndBonusMode: "weeks" })] }],
    ["amount 模式年终奖超上限", { offers: [baseOffer({ yearEndBonusMode: "amount", yearEndBonusValue: 99_000_000 })] }],
    ["公积金比例超上限", { offers: [baseOffer({ housingFundRatePct: 90 })] }],
  ] as const;

  it.each(rejects)("%s → 拒绝且带 error", (_label, body) => {
    const result = buildOfferOpportunity(body, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});
