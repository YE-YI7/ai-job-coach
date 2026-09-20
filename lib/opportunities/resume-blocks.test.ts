import { reorderResumeText, splitResumeBlocks, assignChangesToBlocks, reconstructResumeText, applyReorderToOpportunity } from "./resume-blocks";
import type { ResumeChange } from "./types";

function change(over: Partial<ResumeChange> & { id: string }): ResumeChange {
  return { section: "项目经历", before: "", after: "", reason: "", evidenceId: null, status: "pending", ...over };
}

describe("splitResumeBlocks", () => {
  const resume = [
    "张三",
    "电话：138 | 邮箱：z@x.com",
    "",
    "教育背景",
    "2018-2022 某某大学 计算机 本科",
    "",
    "项目经历",
    "2023.01-2023.06 交易系统重构",
    "负责核心链路设计，QPS 提升 40%",
    "",
    "2022.03-2022.08 数据看板",
    "搭建指标体系，替代人工报表",
    "",
    "专业技能",
    "熟悉 TypeScript、Node.js",
  ].join("\n");

  it("recognises section headers as separate blocks", () => {
    const blocks = splitResumeBlocks(resume);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toContain("education");
    expect(kinds).toContain("skill");
    expect(kinds).toContain("project");
  });

  it("splits multiple projects into one card each", () => {
    const blocks = splitResumeBlocks(resume);
    const projects = blocks.filter((b) => b.kind === "project");
    expect(projects).toHaveLength(2);
    expect(projects[0].lines.join(" ")).toContain("交易系统重构");
    expect(projects[1].lines.join(" ")).toContain("数据看板");
  });

  it("treats the leading name/contact as a header block", () => {
    const blocks = splitResumeBlocks(resume);
    expect(blocks[0].kind).toBe("header");
    expect(blocks[0].lines.join(" ")).toContain("张三");
  });

  it("falls back to a single block when there are no headers", () => {
    const blocks = splitResumeBlocks("只有一段纯文本，没有任何分节标题。");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("other");
  });
});

describe("assignChangesToBlocks", () => {
  it("maps a change to the block containing its before text", () => {
    const blocks = splitResumeBlocks("项目经历\n2023 交易系统\n负责核心链路设计，拆成三个模块");
    const changes = [change({ id: "c1", section: "项目经历", before: "负责核心链路设计，拆成三个模块", after: "负责核心链路设计，拆解为三个模块" })];
    const withChanges = assignChangesToBlocks(blocks, changes);
    const project = withChanges.find((b) => b.kind === "project");
    expect(project?.changeIds).toEqual(["c1"]);
  });

  it("collects unmatched changes into a trailing block instead of dropping them", () => {
    const blocks = splitResumeBlocks("教育背景\n2018-2022 某某大学");
    const changes = [change({ id: "c9", section: "不存在的章节", before: "完全找不到的原文", after: "改写后" })];
    const withChanges = assignChangesToBlocks(blocks, changes);
    const extra = withChanges[withChanges.length - 1];
    expect(extra.title).toBe("其他调整");
    expect(extra.changeIds).toEqual(["c9"]);
  });
});

describe("reorderResumeText", () => {
  const resume = [
    "张三",
    "电话：138",
    "",
    "教育背景",
    "2018-2022 某某大学",
    "",
    "项目经历",
    "2023 交易系统",
    "负责核心链路",
    "",
    "专业技能",
    "TypeScript",
  ].join("\n");

  it("moves a section and rewrites the real resume text", () => {
    const blocks = splitResumeBlocks(resume);
    const skill = blocks.find((b) => b.kind === "skill")!;
    const education = blocks.find((b) => b.kind === "education")!;
    const next = reorderResumeText(resume, skill.id, education.id);
    expect(next).not.toBeNull();
    // skill now appears before education in the actual text.
    expect(next!.indexOf("专业技能")).toBeLessThan(next!.indexOf("教育背景"));
    // content is preserved, nothing invented.
    expect(next).toContain("TypeScript");
    expect(next).toContain("2018-2022 某某大学");
  });

  it("keeps a section heading when one project card moves but siblings stay", () => {
    const twoProjects = "项目经历\n2023 A 项目\n内容A\n\n2022 B 项目\n内容B";
    const blocks = splitResumeBlocks(twoProjects);
    const projects = blocks.filter((b) => b.kind === "project");
    expect(projects).toHaveLength(2);
    // move second project above first — heading must appear exactly once.
    const next = reorderResumeText(twoProjects, projects[1].id, projects[0].id);
    expect(next).not.toBeNull();
    expect((next!.match(/项目经历/g) || []).length).toBe(1);
    expect(next!.indexOf("B 项目")).toBeLessThan(next!.indexOf("A 项目"));
  });

  it("returns null for a no-op or unknown ids", () => {
    expect(reorderResumeText(resume, "nope", "also-nope")).toBeNull();
    const blocks = splitResumeBlocks(resume);
    expect(reorderResumeText(resume, blocks[0].id, blocks[0].id)).toBeNull();
  });
});

const nonBlank = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

describe("重排不丢内容（round-trip 不变量）", () => {
  // GPT 复现：拖动项目后「技能：Python」整行消失——行内带内容的「技能：…」被
  // 误判为章节标题后没有落进任何块，reconstruct 无法还原。
  it("「技能：Python」这类带内容的行不会被当成章节标题而丢掉", () => {
    const text = [
      "项目经历",
      "2023.01-2023.06 智能客服工作台",
      "主导需求验证到上线",
      "",
      "2022.03-2022.08 数据看板",
      "搭建指标体系",
      "",
      "技能：Python",
    ].join("\n");
    // 「技能：Python」不再是章节标题，而是作为内容行留在块里（不再被吞掉）。
    const blocks = splitResumeBlocks(text);
    expect(blocks.some((b) => b.lines.includes("技能：Python"))).toBe(true);
    const projects = blocks.filter((b) => b.kind === "project");
    const next = reorderResumeText(text, projects[1].id, projects[0].id);
    expect(next).not.toBeNull();
    for (const line of nonBlank(text)) expect(next).toContain(line);
  });

  it("末尾孤零零的章节标题（没有任何内容行）也能重建回来", () => {
    const text = "教育背景\n2018-2022 某某大学\n\n专业技能";
    const blocks = splitResumeBlocks(text);
    const rebuilt = reconstructResumeText(blocks);
    for (const line of nonBlank(text)) expect(rebuilt).toContain(line);
  });

  it("连续两个章节标题、第一个没有内容时不丢行", () => {
    const text = "项目经历\n2023 A 项目\n证书\n日语 N1";
    const rebuilt = reconstructResumeText(splitResumeBlocks(text));
    for (const line of nonBlank(text)) expect(rebuilt).toContain(line);
  });
});

describe("applyReorderToOpportunity", () => {
  const base = {
    id: "o-1",
    stage: "evaluating",
    resumeChanges: [],
    requirements: [],
    interviewFocus: [],
    resumeText: "项目经历\n2023 A 项目\n内容A\n\n2022 B 项目\n内容B",
  } as unknown as import("./types").Opportunity;

  it("改写了正文顺序；没有冻结产物时不标过期", () => {
    const projects = splitResumeBlocks(base.resumeText!).filter((b) => b.kind === "project");
    const result = applyReorderToOpportunity(base, projects[1].id, projects[0].id);
    expect(result.changed).toBe(true);
    expect(result.invalidatedFreeze).toBe(false);
    expect(result.opportunity.frozenStale).toBeUndefined();
    expect(result.opportunity.resumeText!.indexOf("B 项目")).toBeLessThan(result.opportunity.resumeText!.indexOf("A 项目"));
  });

  it("已有冻结投递产物时：改写正文就把版本标过期", () => {
    const frozen = {
      ...base,
      applicationQuality: { artifactId: "art-1", version: 2, status: "ready" as const, reviews: [] },
      snapshots: [{ id: "s-1", snapshotType: "submitted_resume" as const, version: 2, title: "投递简历", frozenAt: "2026-09-01T00:00:00.000Z" }],
    };
    const projects = splitResumeBlocks(frozen.resumeText!).filter((b) => b.kind === "project");
    const result = applyReorderToOpportunity(frozen, projects[0].id, projects[1].id);
    expect(result.changed).toBe(true);
    expect(result.invalidatedFreeze).toBe(true);
    expect(result.opportunity.frozenStale).toBe(true);
  });

  it("原地拖动 / 未知 id：不改状态也不标过期", () => {
    const projects = splitResumeBlocks(base.resumeText!).filter((b) => b.kind === "project");
    expect(applyReorderToOpportunity(base, projects[0].id, projects[0].id).changed).toBe(false);
    expect(applyReorderToOpportunity(base, "nope", projects[0].id).changed).toBe(false);
  });
});
