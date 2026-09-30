import {
  runVerificationAgent,
  toVerificationInput,
  VERIFICATION_DEGRADED_COPY,
  type CompanyDirectoryEntry,
  type CompanyTierDirectory,
} from "./verification";
import { mainPromptPayloadFor, type BudgetSpec } from "./contract";

const budget: BudgetSpec = { maxSourceCalls: 0, maxTokens: 0, maxWallClockMs: 5000, idempotencyKey: `v-${Math.random()}` };

const ENTRIES: CompanyDirectoryEntry[] = [
  { name: "巨厂科技", domain: "juchang.com", tier: "big_tech", identityConfirmed: true },
  { name: "小灶软件", domain: "xiaozao.cn", tier: "mid_small", identityConfirmed: true },
  { name: "同名公司", domain: "tongming-a.com", tier: "big_tech", identityConfirmed: false },
];

const directory: CompanyTierDirectory = {
  lookup: (name, domain) =>
    ENTRIES.find((e) => e.name === name && (!domain || e.domain === domain)) ?? null,
};

function candidate(dedupeKey: string, company: string) {
  return {
    dedupeKey,
    company,
    companyDomain: undefined,
    title: "产品经理",
    location: "北京",
    retrievalOpinion: { decision: "keep" as const, matchedField: "keyword", reason: "由关键词命中，检索说合适" },
  };
}

describe("FR-9 核验：公司层次对照用户目标", () => {
  it("每条结论带命中字段与理由；命中档位保留、不命中剔除、查不到拿不准", async () => {
    const outcome = await runVerificationAgent(
      {
        candidates: [candidate("k1", "巨厂科技"), candidate("k2", "小灶软件"), candidate("k3", "查无此司"), candidate("k4", "同名公司")],
        goal: { targetTiers: ["big_tech"] },
        budget,
      },
      { directory, isoNow: "2026-09-30T00:00:00Z" },
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const byKey = Object.fromEntries(outcome.product.decisions.map((d) => [d.dedupeKey, d]));
    expect(byKey.k1.verdict).toBe("keep");
    expect(byKey.k1.matchedField).toBe("company_tier_directory");
    expect(byKey.k2.verdict).toBe("drop");
    expect(byKey.k2.reason).toContain("不在用户目标档位");
    expect(byKey.k3.verdict).toBe("unsure"); // 拿不准就保留
    expect(byKey.k3.verified).toBe(false);
    expect(byKey.k4.verdict).toBe("unsure"); // 身份未双校验 → 不据此剔除
    expect(outcome.product.finalKeys).toEqual(expect.arrayContaining(["k1", "k3", "k4"]));
    expect(outcome.product.finalKeys).not.toContain("k2");
  });

  it("FR-9 冲突规则：检索说合适、核验（规则层）说层次不符 → 以规则层为准并记冲突", async () => {
    const outcome = await runVerificationAgent(
      { candidates: [candidate("k2", "小灶软件")], goal: { targetTiers: ["big_tech"] }, budget },
      { directory, isoNow: "2026-09-30T00:00:00Z" },
    );
    if (outcome.status !== "ok") throw new Error("unexpected");
    expect(outcome.product.conflicts).toHaveLength(1);
    const conflict = outcome.product.conflicts[0];
    expect(conflict.resolvedBy).toBe("deterministic_rule");
    expect(conflict.finalDecision).toBe("drop");
    expect(conflict.rule.ruleId).toBe("company_tier_directory");
    expect(conflict.opinion.reason).toBe("由关键词命中，检索说合适");
  });

  it("没设目标档位 = 一律保留：空数组不得把名录里查得到的公司删掉", async () => {
    const outcome = await runVerificationAgent(
      {
        candidates: [candidate("k1", "巨厂科技"), candidate("k2", "小灶软件"), candidate("k3", "查无此司")],
        goal: { targetTiers: [] },
        budget,
      },
      { directory, isoNow: "2026-09-30T00:00:00Z" },
    );
    if (outcome.status !== "ok") throw new Error("unexpected");
    const byKey = Object.fromEntries(outcome.product.decisions.map((d) => [d.dedupeKey, d]));
    expect(byKey.k1.verdict).toBe("keep");
    expect(byKey.k1.matchedField).toBe("target_tiers_empty");
    // 层次仍然报得出来：用户看得见「这是一家大厂」，只是系统不据此取舍。
    expect(byKey.k1.companyTier).toBe("big_tech");
    expect(byKey.k2.companyTier).toBe("mid_small");
    expect(outcome.product.finalKeys).toEqual(["k1", "k2", "k3"]);
    expect(outcome.product.conflicts).toHaveLength(0);
  });

  it("核验坏了：全部保留并标注未核验（degraded），不是静默剔除", async () => {
    const exploding: CompanyTierDirectory = {
      lookup: () => {
        throw new Error("名录存储不可用");
      },
    };
    const outcome = await runVerificationAgent(
      { candidates: [candidate("a", "任意"), candidate("b", "公司")], goal: { targetTiers: ["big_tech"] }, budget },
      { directory: exploding, isoNow: "now" },
    );
    expect(outcome.status).toBe("degraded");
    const payload = mainPromptPayloadFor(outcome);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.note).toBe(VERIFICATION_DEGRADED_COPY);
    expect(payload.product.finalKeys).toEqual(["a", "b"]);
    expect(payload.product.decisions.every((d) => d.verified === false)).toBe(true);
  });

  it("toVerificationInput：检索产物直接转核验输入，软匹配意见随行", () => {
    const input = toVerificationInput(
      [
        {
          dedupeKey: "z1",
          url: "https://x",
          fetchedAt: "f",
          postedAt: null,
          company: "巨厂科技",
          title: "产品经理",
          location: "北京",
          freshness: "待核实",
          hardVerdict: "keep",
          pendingProfileFields: [],
          source: { kind: "external", url: "https://x", fetchedAt: "f", trust: "untrusted" },
          soft: [{ matchedField: "keyword", reason: "由关键词「产品经理」命中", label: "外部信息" }],
        },
      ],
      { targetTiers: [] },
      budget,
    );
    expect(input.candidates[0].retrievalOpinion.matchedField).toBe("keyword");
  });
});
