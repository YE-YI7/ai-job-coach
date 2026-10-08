import { jobDedupeKey } from "@/lib/coach-harness/subagents/retrieval";
import { applyRetrievalGate, jdHardRequirements, profileHardFields, type GatedJob, type MatchedJob } from "./retrieval-gate";
import type { DiscoveredJob } from "./discovery";

const NOW = Date.parse("2026-09-30T00:00:00Z");
const job = (over: Partial<DiscoveredJob> = {}): MatchedJob => ({
  id: "/meshy/1",
  company: "Meshy",
  title: "Product Manager",
  location: "Shanghai",
  url: "https://jobs.ashbyhq.com/meshy/1",
  description: "You will own the roadmap.",
  checkedAt: "2026-09-30T00:00:00Z",
  publishedAt: "2026-09-27T00:00:00Z",
  reasons: ["职位名称与求职方向相关"],
  ...over,
});

/* ----------------            JD 侧要求抽取            ---------------- */

test("英文 JD：年限与学历都抽得出，并带原文证据", () => {
  const { hard, requirements } = jdHardRequirements(
    "Requirements: 5+ years of product management experience. Bachelor's degree in a technical field.",
  );
  expect(hard.yearsMin).toBe(5);
  expect(hard.educationMin).toBe("bachelor");
  expect(requirements.map((r) => r.dimension).sort()).toEqual(["education", "years"]);
  requirements.forEach((r) => expect(r.evidence).toMatch(/experience|Bachelor/i));
});

test("要求不必写成「relevant experience」：任意限定词都要认", () => {
  expect(jdHardRequirements("You have 5+ years of product management experience.").hard.yearsMin).toBe(5);
  expect(jdHardRequirements("3 years experience with LLM products.").hard.yearsMin).toBe(3);
});

test("中文 JD：三年以上经验、本科及以上学历", () => {
  const { hard } = jdHardRequirements("岗位职责略。要求：三年以上相关工作经验，本科及以上学历。");
  expect(hard.yearsMin).toBe(3);
  expect(hard.educationMin).toBe("bachelor");
});

test("「硕士优先、本科及以上」取最低门槛：门槛是本科不是硕士", () => {
  expect(jdHardRequirements("本科及以上学历，硕士优先。").hard.educationMin).toBe("bachelor");
  expect(jdHardRequirements("Bachelor's degree required, Master's preferred.").hard.educationMin).toBe("bachelor");
});

test("软性表述不成门槛：preferred / or equivalent 一律不设限", () => {  expect(jdHardRequirements("5+ years of experience preferred.").hard.yearsMin).toBeUndefined();
  expect(jdHardRequirements("Bachelor's degree or equivalent practical background.").hard.educationMin).toBeUndefined();
});

test("区间取下限：3-5 年 / 3-5 years of experience 门槛都是 3 年", () => {
  expect(jdHardRequirements("要求：3-5 年产品经验。").hard.yearsMin).toBe(3);
  expect(jdHardRequirements("3-5 years of experience in a related field.").hard.yearsMin).toBe(3);
});

test("日期与公司历史不截出假门槛（2024年 / 10 years ago）", () => {
  expect(jdHardRequirements("2024年发布，团队有丰富经验。").hard.yearsMin).toBeUndefined();
  expect(jdHardRequirements("Founded 10 years ago, we have experience shipping at scale.").hard.yearsMin).toBeUndefined();
});

test("抽不出要求 = 不设限，绝不据此剔除", () => {
  expect(jdHardRequirements("We hire curious people who love design.").hard).toEqual({});
});

/* ----------------            档案侧硬指标            ---------------- */

test("简历写明年限与学历 → 档案填得上", () => {
  expect(profileHardFields("8 年后端开发经验，硕士学历。")).toEqual({ yearsExperience: 8, education: "master" });
  expect(profileHardFields("6 years of product management experience. Bachelor's degree.").yearsExperience).toBe(6);
});

test("简历只写日期不写年限 → 不猜，留空转「待补」", () => {
  expect(profileHardFields("2020 - 2024 ACME 公司 产品经理")).not.toHaveProperty("yearsExperience");
  expect(profileHardFields("2020年 - 2024年工作，负责后台需求。")).not.toHaveProperty("yearsExperience");
});

test("Ms. 不会被当成硕士学历", () => {
  expect(profileHardFields("Contact Ms. Wang for details.").education).toBeUndefined();
});

test("真实入口场景：完整任职月份识别两年，排除三年负责人岗位", () => {
  const resume = "林小雨，本科，2024年毕业。2024.07—2026.06，零售公司运营专员：整理订单与库存数据。";
  expect(profileHardFields(resume).yearsExperience).toBe(2);
  const result = applyRetrievalGate([job({ description: "要求三年以上工作经验，本科及以上。" })], { profile: profileHardFields(resume), nowMs: NOW });
  expect(result.kept).toHaveLength(0);
  expect(result.filtered).toHaveLength(1);
});

test("任职区间重叠不重复计数，未满一年保留零年", () => {
  expect(profileHardFields("2023.01—2024.12 公司A产品经理\n2024.01—2025.12 公司B运营专员").yearsExperience).toBe(3);
  expect(profileHardFields("2025.01—2025.06 公司运营专员").yearsExperience).toBe(0);
});

test("学习、实习、无职业身份、无月份、未来和非法日期不猜年限", () => {
  for (const text of ["2020.09—2024.06 大学本科", "2024.01—2025.12 产品经理实习", "2024.01—2025.12 个人项目", "2024.13—2025.12 运营专员", "2024.01—2099.12 运营专员", "2024.01—至今 运营专员"]) {
    expect(profileHardFields(text).yearsExperience).toBeUndefined();
  }
  expect(profileHardFields("5年工作经验。2024.01—2025.12 运营专员").yearsExperience).toBe(5);
});

/* ----------------            硬筛 + 待补（FR-5/6）            ---------------- */

const gate = (jobs: MatchedJob[], resumeText: string) =>
  applyRetrievalGate(jobs, { profile: profileHardFields(resumeText), nowMs: NOW });

test("档案 2 年 × JD 要求 5 年 → 剔除，且带可回查的判定轨迹", () => {
  const r = gate([job({ description: "Requirements: 5+ years of experience." })], "2 年产品经验，本科学历。");
  expect(r.kept).toHaveLength(0);
  expect(r.filtered[0].reasons.join()).toContain("5 年");
});

test("档案缺字段不阻断：保留 + 标注待补，一条都不少", () => {
  const r = gate([job({ description: "Requirements: 5+ years of experience. Bachelor's degree." })], "负责过三个版本迭代。");
  expect(r.kept).toHaveLength(1);
  expect(r.kept[0].hardVerdict).toBe("keep_pending_profile");
  expect(r.kept[0].pendingProfileFields.sort()).toEqual(["education", "years"]);
  expect(r.pendingProfileFields.sort()).toEqual(["education", "years"]);
});

test("够格就留：档案 8 年硕士 × JD 5 年本科", () => {
  const r = gate([job({ description: "Requirements: 5+ years of experience. Bachelor's degree." })], "8 年经验，硕士学历。");
  expect(r.kept[0].hardVerdict).toBe("keep");
  expect(r.kept[0].pendingProfileFields).toEqual([]);
  expect((r.kept[0] as GatedJob).jdRequirements).toHaveLength(2);
});

/* ----------------            去重（FR-10）与时效（FR-11）            ---------------- */

test("同一岗位两条布告只出现一次，键来自去重函数而不是 URL", () => {
  const r = gate([job(), job({ id: "/meshy/2", url: "https://jobs.ashbyhq.com/meshy/2" })], "");
  expect(r.kept).toHaveLength(1);
  expect(r.kept[0].dedupeKey).toBe(jobDedupeKey({ company: "Meshy", title: "Product Manager", location: "Shanghai" }));
});

test("3 天前发布 = 在售；45 天前或没有布告时间 = 待核实，绝不写在售", () => {
  const fresh = gate([job({ publishedAt: "2026-09-27T00:00:00Z" })], "").kept[0];
  const stale = gate([job({ publishedAt: "2026-08-15T00:00:00Z" })], "").kept[0];
  const unknown = gate([job({ publishedAt: null })], "").kept[0];
  expect([fresh.freshness, stale.freshness, unknown.freshness]).toEqual(["in_sale", "待核实", "待核实"]);
});

test("地点仍由 matchJobs 负责：这里不做第二套城市判定", () => {
  const r = gate([job({ location: "Remote - Worldwide" })], "2 年经验");
  expect(r.kept).toHaveLength(1);
  expect(r.kept[0].jdRequirements).toEqual([]);
});

test("中文数字年限与 JD 侧同一读法：「三年产品经验」是可核对的 3 年，不是空白", () => {
  expect(profileHardFields("三年产品经验，负责会员体系。").yearsExperience).toBe(3);
  // 门槛 5 年 > 已证明的 3 年：这是真冲突，该被硬筛剔掉并说明理由，而不是当成「待补」一直留着。
  const result = applyRetrievalGate([job({ description: "岗位职责：整理需求。任职要求：5 年以上相关工作经验。" })], { profile: profileHardFields("三年产品经验，负责会员体系。"), nowMs: NOW });
  expect(result.filtered).toHaveLength(1);
  expect(result.filtered[0].reasons.join()).toContain("档案 3 年 < JD 下限 5 年");
});

test("「一年内完成」是时限不是年限，不许凭空造出一年经验", () => {
  expect(profileHardFields("负责数据看板，2024.07 入职，一年内完成三版迭代工作。").yearsExperience).toBeUndefined();
});
