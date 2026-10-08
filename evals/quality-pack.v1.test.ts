import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runStructureCase } from "./quality-pack.v1";
import { E2E_PATHS, QUALITY_PACK_VERSION, SAFETY_CASES, SELECTION_CASES, TUTORING_CASES, evidenceOnly, missingScenarios, runQualityPack } from "./quality-pack.v1";

const ALL = [...SELECTION_CASES, ...TUTORING_CASES, ...SAFETY_CASES];

test("结构验收首屏与真实分组一致：未知资格不占优先位", async () => {
  for (const item of SELECTION_CASES) {
    const run = await runStructureCase(item);
    const passed = Object.values(run.eligibility).filter((state) => state === "pass").length;
    expect(run.firstScreen).toBe(Math.min(passed, 3));
  }
});

test("案例集数量按 PRD 固化：20 选岗 + 20 多轮教学 + 10 安全反例，ID 不重复", () => {
  expect(SELECTION_CASES).toHaveLength(20);
  expect(TUTORING_CASES).toHaveLength(20);
  expect(SAFETY_CASES).toHaveLength(10);
  expect(new Set(ALL.map((item) => item.id)).size).toBe(ALL.length);
});

test("PRD 点名的场景一个都不能缺，含两条教学硬反例", () => {
  expect(missingScenarios(ALL)).toEqual([]);
  const scenarios = ALL.map((item) => item.scenario);
  expect(scenarios).toContain("反例·虚构不足");
  expect(scenarios).toContain("反例·只读过");
});

test("每条教学案例至少三轮，判据写得人能照着打分", () => {
  for (const item of TUTORING_CASES) {
    expect(item.content!.turns.length).toBeGreaterThanOrEqual(3);
    expect(item.content!.rubric.length).toBeGreaterThanOrEqual(2);
  }
});

test("否定句不进简历证据：没有做过不会被当成经历", () => {
  expect(evidenceOnly("负责会员体系与复购。没有做过 Agent 产品，希望转 AI 方向。")).toEqual(["负责会员体系与复购。"]);
});

test("安全反例里可确定性判定的那几条今天必须全过", async () => {
  const report = await runQualityPack(SAFETY_CASES.filter((item) => item.layer === "structure"));
  expect(report.results.filter((result) => result.status === "fail")).toEqual([]);
});

/** 结构层是「同一批材料可复现当前质量问题」的那一层：它一旦变红就是产品行为退回了，不是打分口径变了。 */
test("选岗结构层今天必须全过：校招召回与中文年限口径不许退回", async () => {
  const report = await runQualityPack(SELECTION_CASES);
  expect(report.results.filter((result) => result.status !== "pass")).toEqual([]);
  expect(report.gate.structuralFailures).toBe(0);
});

test("八条真实端到端路径登记齐，未跑就标 not_run", () => {
  expect(E2E_PATHS).toHaveLength(8);
  expect(E2E_PATHS.map((path) => path.id)).toEqual(["e2e-1", "e2e-2", "e2e-3", "e2e-4", "e2e-5", "e2e-6", "e2e-7", "e2e-8"]);
});

test("跑一遍质量集：结构层出矩阵，内容层不自动给分", async () => {
  const report = await runQualityPack();
  const rows = report.results.map((result) => `${result.status.toUpperCase().padEnd(7)} ${result.id}  ${result.title}${result.failures.length ? ` — ${result.failures.join("；")}` : ""}`);
  console.log(`\n[${QUALITY_PACK_VERSION}] 结构 ${report.totals.structure} / 内容 ${report.totals.content}：pass ${report.counts.pass} · fail ${report.counts.fail} · missing ${report.counts.missing}\n${rows.join("\n")}\n`);

  expect(report.counts.missing).toBe(report.totals.content);
  expect(report.gate.semanticAcceptance).toBe("not_evaluated");
  expect(report.gate.publishable).toBe(false);
  expect(report.results.filter((result) => result.layer === "content").every((result) => result.status === "missing")).toBe(true);

  if (process.env.WRITE_QUALITY_BASELINE) {
    const file = process.env.WRITE_QUALITY_BASELINE;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
});
