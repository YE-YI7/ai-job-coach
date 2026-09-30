import { VERIFICATION_DEGRADED_COPY } from "@/lib/coach-harness/subagents/verification";
import { indexCompanyDirectory, type CompanyDirectoryRecord } from "./company-directory";
import { applyRetrievalGate, profileHardFields, type MatchedJob } from "./retrieval-gate";
import { applyVerificationGate } from "./verification-gate";

const NOW_ISO = "2026-09-30T00:00:00Z";
const NOW_MS = Date.parse(NOW_ISO);

const job = (company: string, over: Partial<MatchedJob> = {}): MatchedJob => ({
  id: `/${company}/1`,
  company,
  title: "Product Manager",
  location: "Shanghai",
  url: `https://jobs.ashbyhq.com/x/1`,
  description: "Own the roadmap.",
  checkedAt: NOW_ISO,
  publishedAt: "2026-09-28T00:00:00Z",
  reasons: ["职位名称与求职方向相关"],
  ...over,
});

/** 硬筛先跑一遍，核验拿到的就是链路上真实的候选集。 */
const gateOf = (...jobs: MatchedJob[]) =>
  applyRetrievalGate(jobs, { profile: profileHardFields("8 年产品经验，本科学历。"), nowMs: NOW_MS });

const record = (over: Partial<CompanyDirectoryRecord> = {}): CompanyDirectoryRecord => ({
  name: "巨厂科技",
  domain: "juchang.com",
  tier: "big_tech",
  aliases: [],
  identityConfirmed: true,
  identityBasis: "板页法人名已核。",
  tierBasis: "上市集团，万人级员工。",
  reviewAt: "2026-12-31",
  sources: [{ url: "https://example.com/a", title: "报道", publishedAt: "2026-01-01" }],
  ...over,
});

/* ----------------            标注：今天就在生效的部分            ---------------- */

test("名录认得出的公司给层次与依据，认不出的照样保留（拿不准就保留）", async () => {
  const result = await applyVerificationGate(gateOf(job("Meshy"), job("Kong"), job("查无此司")), { isoNow: NOW_ISO });
  expect(result.status).toBe("ok");
  expect(result.note).toBeNull();
  expect(result.kept).toHaveLength(3);
  const meshy = result.kept.find((j) => j.company === "Meshy")!;
  expect(meshy.companyTier).toBe("mid_small");
  expect(meshy.tierLabel).toBe("独立融资的互联网/软件公司");
  // 没有目标档位入口时只做标注：层次是核过的，但不拿它筛人
  expect(meshy.tierMatchedField).toBe("target_tiers_empty");
  expect(meshy.tierVerdict).toBe("keep");
  expect(meshy.tierBasis).toContain("B 轮");
  expect(meshy.tierSources.length).toBeGreaterThan(1);
  const unknown = result.kept.find((j) => j.company === "查无此司")!;
  expect(unknown.companyTier).toBeNull();
  expect(unknown.tierLabel).toBeNull();
  expect(unknown.tierVerdict).toBe("unsure");
  expect(unknown.verified).toBe(false);
  expect(unknown.tierMatchedField).toBe("lookup_miss");
  expect(unknown.tierReason).toContain("拿不准就保留");
  // 覆盖率如实报，不假装全认得
  expect(result.coverage).toEqual({ total: 3, inDirectory: 2 });
  expect(result.directoryVerifiedAt).toBe("2026-09-30");
});

test("每条候选都带层次结论与理由，一条不落", async () => {
  const gate = gateOf(job("Meshy"), job("Kong"));
  const result = await applyVerificationGate(gate, { isoNow: NOW_ISO });
  expect(result.kept.map((j) => [j.company, j.tierVerdict, j.tierReason !== ""])).toEqual([
    ["Meshy", "keep", true],
    ["Kong", "keep", true],
  ]);
});

/* ----------------            剔除：档位有入口后立刻生效            ---------------- */

test("用户设了目标档位：层次不符的岗位进 filtered 并写明为什么", async () => {
  const directory = indexCompanyDirectory(
    [record(), record({ name: "小灶软件", domain: "xiaozao.cn", tier: "mid_small", tierBasis: "A 轮创业公司。" })],
    NOW_ISO.slice(0, 10),
  );
  const result = await applyVerificationGate(gateOf(job("巨厂科技"), job("小灶软件"), job("查无此司")), {
    isoNow: NOW_ISO,
    goalTargetTiers: ["big_tech"],
    directory,
  });
  expect(result.kept.map((j) => j.company)).toEqual(["巨厂科技", "查无此司"]);
  expect(result.filtered).toHaveLength(1);
  expect(result.filtered[0].company).toBe("小灶软件");
  expect(result.filtered[0].reasons.join()).toContain("不在你选的目标档位");
  expect(result.filtered[0].reasons.join()).toContain("独立融资的互联网/软件公司");
  // 剔人理由不能露枚举码：用户看不懂 mid_small
  expect(result.filtered[0].reasons.join()).not.toMatch(/mid_small|big_tech/);
  expect(result.coverage).toEqual({ total: 2, inDirectory: 1 });
});

test("名录里身份没双校验的记录不给剔除：保留待核实", async () => {
  const directory = indexCompanyDirectory([record({ identityConfirmed: false })], NOW_ISO.slice(0, 10));
  const result = await applyVerificationGate(gateOf(job("巨厂科技")), {
    isoNow: NOW_ISO,
    goalTargetTiers: ["mid_small"],
    directory,
  });
  expect(result.kept).toHaveLength(1);
  expect(result.kept[0].verified).toBe(false);
  expect(result.kept[0].tierReason).toContain("未双校验");
});

/* ----------------            失败语义：坏了不少岗位            ---------------- */

test("名录查询抛错：全部保留 + 标注未核验，不静默剔除", async () => {
  const broken = indexCompanyDirectory([record()], NOW_ISO.slice(0, 10));
  const directory = { ...broken, lookup: () => { throw new Error("名录存储不可用"); } };
  const gate = gateOf(job("巨厂科技"), job("小灶软件"));
  const result = await applyVerificationGate(gate, { isoNow: NOW_ISO, goalTargetTiers: ["big_tech"], directory });
  expect(result.status).toBe("degraded");
  expect(result.note).toBe(VERIFICATION_DEGRADED_COPY);
  expect(result.kept.map((j) => j.company)).toEqual(["巨厂科技", "小灶软件"]);
  expect(result.kept.every((j) => j.verified === false && j.tierLabel === null && j.tierSources.length === 0)).toBe(true);
  expect(result.directoryVerifiedAt).toBeNull();
});

test("硬筛剔掉的岗位原样留在 filtered，核验不重复计数也不改判", async () => {
  const gate = applyRetrievalGate(
    [job("Meshy"), job("Kong", { id: "/Kong/1", description: "Requirements: 10+ years of experience." })],
    { profile: profileHardFields("2 年产品经验，本科学历。"), nowMs: NOW_MS },
  );
  expect(gate.filtered).toHaveLength(1);
  const result = await applyVerificationGate(gate, { isoNow: NOW_ISO });
  expect(result.filtered).toHaveLength(1);
  expect(result.filtered[0].company).toBe("Kong");
  expect(result.kept.map((j) => j.company)).toEqual(["Meshy"]);
});
