import { buildReview, decisionRiskFor, deriveEligibility, reviewReasons } from "./review-contract";
import { eligibility } from "./personalization";
import type { VerifiedJob } from "./verification-gate";

const job = (over: Partial<VerifiedJob> = {}): VerifiedJob => ({
  id: "1", company: "测试", title: "产品经理", location: "上海",
  url: "https://example.com/1", checkedAt: "2026-10-01", publishedAt: "2026-09-20",
  description: "岗位职责：整理用户反馈。任职要求：5 年以上相关工作经验。",
  reasons: [], dedupeKey: "1", freshness: "in_sale", hardVerdict: "keep",
  pendingProfileFields: [], jdRequirements: [], companyTier: null, tierLabel: null,
  tierVerdict: "unsure", tierMatchedField: "target_tiers_empty", tierReason: "",
  verified: true, tierBasis: null, tierSources: [], ...over,
});
const resume = "3 年产品经验，负责退货原因分类。本科。";
const refs = { resumeQuote: { id: 0, text: "负责退货原因分类。" }, jdQuote: { id: 1, text: "整理用户反馈。" } };

test("已知资格冲突由服务端拦下，模型选了也不给优先候选位", () => {
  // 岗位本身写着「5 年以上」，档案只有 3 年：硬筛该剔的那条，评审这里再算一遍。
  expect(deriveEligibility(job(), resume)).toBe("conflict");
  expect(deriveEligibility(job({ description: "岗位职责：整理用户反馈。" }), resume)).toBe("pass");
});

test("档案缺门槛 = 先核实条件，不等于不符合", () => {
  const pending = job({ hardVerdict: "keep_pending_profile", pendingProfileFields: ["years"],
    jdRequirements: [{ dimension: "years", label: "经验 ≥ 5 年", evidence: "5 年以上相关工作经验" }] });
  const review = buildReview({ job: pending, resume: "负责退货原因分类。", ...refs, gap: null });
  expect(review.eligibility).toBe("unknown");
  expect(review.decisionRisk).toEqual({ kind: "eligibility_unknown", text: "该岗要求「经验 ≥ 5 年」，你的材料里还没有可核对的工作年限" });
});

test("在读身份未知归入要先确认，不写成本科以下", () => {
  const marked = eligibility(job({ description: "岗位职责：整理用户反馈。任职要求：大三在校学生。" }), "本科，8 年产品经验");
  const review = buildReview({ job: marked, resume: "本科，8 年产品经验。", ...refs, gap: null });
  expect(review.eligibility).toBe("unknown");
  expect(review.decisionRisk?.kind).toBe("eligibility_unknown");
  expect(review.decisionRisk?.text).toContain("需核实在读身份");
});

test("风险只给一条：实际差距排在招聘信息待核实之前", () => {
  const stale = job({ freshness: "待核实", publishedAt: null });
  expect(decisionRiskFor(stale, "独立运营活动的经历尚未提供")).toEqual({ kind: "capability_gap", text: "独立运营活动的经历尚未提供" });
  expect(decisionRiskFor(stale, null)?.kind).toBe("listing_unverified");
});

test("依据与原文引用由服务端回填，模型改写不进契约", () => {
  const review = buildReview({ job: job(), resume, ...refs, gap: null });
  expect(review.requirementRefs).toEqual([{ id: 1, text: "整理用户反馈。" }]);
  expect(review.fitReason).toBe("你做过「负责退货原因分类。」，与该岗「整理用户反馈。」相近");
  expect(review.nextAction).toBe("assess_this_job");
});

test("没有可迁移经历时依据如实说没有，不硬编一句个人总结", () => {
  expect(buildReview({ job: job(), resume, resumeQuote: null, jdQuote: refs.jdQuote, gap: null }).fitReason)
    .toBe("简历暂未提供此岗的直接经历；该岗职责为「整理用户反馈。」");
});

test("展示投影沿用拆分前的顺序，旧卡片不因契约改动而变样", () => {
  const marked = eligibility(job({ description: "岗位职责：整理用户反馈。任职要求：大三在校学生。" }), "本科，8 年产品经验");
  const gap = "独立运营经历未提供";
  const review = buildReview({ job: marked, resume: "本科，8 年产品经验。", ...refs, gap });
  expect(reviewReasons(review, marked, { gap, learn: "拆一次退货流程" })).toEqual([
    "可迁移经历：负责退货原因分类。",
    "岗位依据：整理用户反馈。",
    "待补能力：独立运营经历未提供",
    "可以先练：拆一次退货流程",
    marked.reasons[0],
  ]);
});
