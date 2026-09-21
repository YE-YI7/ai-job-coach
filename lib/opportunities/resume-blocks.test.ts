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

test.each(["字节跳动 · 产品实习生", "**字节跳动 · 产品实习生**"])("公司与日期同卡：%s", (company) => {
  const text = `实习经历\n${company}\n2023.01-2023.06\n负责需求分析`;
  const blocks = splitResumeBlocks(text);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].lines).toEqual(text.split("\n").slice(1));
});

test("带年份的成果是正文，下一家公司独立成卡，拖拽不丢行", () => {
  const text = "## 实习经历\n**字节跳动**\n2023.01-2023.06\n- 2023 年完成上线\n**美团**\n2022.01-2022.06\n- 搭建报表";
  const blocks = splitResumeBlocks(text);
  expect(blocks).toHaveLength(2);
  expect(blocks[0].lines).toContain("- 2023 年完成上线");
  expect(blocks[1].lines[0]).toBe("**美团**");
  const reordered = reorderResumeText(text, blocks[1].id, blocks[0].id)!;
  for (const line of nonBlank(text)) expect(reordered).toContain(line);
});

describe("markdown 简历（## 标题、**加粗**）也能按节/条目分块", () => {
  const md = [
    "# 张三",
    "电话：138 | 邮箱：z@x.com",
    "",
    "## **实习经历**",
    "**字节跳动 · AI 产品实习生**",
    "2023.01-2023.06",
    "- 主导智能客服工作台需求验证到上线，准确率提升 12%",
    "",
    "**美团 · 产品实习生**",
    "2022.03-2022.08",
    "- 搭建指标体系，替代人工报表",
    "",
    "## 项目经历",
    "**数据看板重构**",
    "2022.01-2022.06 负责核心链路",
    "",
    "## 教育经历",
    "2018-2022 某某大学 计算机 本科",
  ].join("\n");

  it("带 markdown 符号的章节标题被识别，每段实习/项目各自成卡", () => {
    const blocks = splitResumeBlocks(md);
    const experience = blocks.filter((b) => b.kind === "experience");
    const projects = blocks.filter((b) => b.kind === "project");
    expect(experience).toHaveLength(2);
    expect(projects).toHaveLength(1);
    expect(blocks.map((b) => b.kind)).toContain("education");
    // 卡片标题用条目自己的名字，不再全部叫「实习经历」。
    expect(experience[0].title).toContain("字节跳动");
    expect(experience[1].title).toContain("美团");
  });

  it("条目卡里的 bullet 内容是正文，不会被当成标题吞掉", () => {
    const blocks = splitResumeBlocks(md);
    const rebuilt = reconstructResumeText(blocks);
    for (const line of nonBlank(md)) expect(rebuilt).toContain(line);
  });

  it("拖动实习卡改写真实文本且逐行不丢", () => {
    const blocks = splitResumeBlocks(md);
    const experience = blocks.filter((b) => b.kind === "experience");
    const next = reorderResumeText(md, experience[1].id, experience[0].id);
    expect(next).not.toBeNull();
    expect(next!.indexOf("美团")).toBeLessThan(next!.indexOf("字节跳动"));
    for (const line of nonBlank(md)) expect(next).toContain(line);
  });

  it("change.section 仍能落回对应节的条目卡（标题已换成条目名）", () => {
    const blocks = splitResumeBlocks(md);
    const changes = [change({ id: "m1", section: "实习经历", before: "完全不在原文里的建议句", after: "改写" })];
    const withChanges = assignChangesToBlocks(blocks, changes);
    const carried = withChanges.filter((b) => b.changeIds.includes("m1"));
    expect(carried.length).toBe(1);
    expect(carried[0].kind).toBe("experience");
  });
});

describe("条目之间没有空行也要逐条拆卡（LLM 紧凑 markdown 简历）", () => {
  it("相邻加粗开场行各自成卡，公司行和自己的日期行不被拆散", () => {
    const text = [
      "## 实习经历",
      "**字节跳动 · AI 产品实习生**",
      "2023.01-2023.06",
      "- 主导客服工作台，准确率提升 12%",
      "**美团 · 产品实习生**",
      "2022.03-2022.08",
      "- 搭建指标体系",
    ].join("\n");
    const experience = splitResumeBlocks(text).filter((b) => b.kind === "experience");
    expect(experience).toHaveLength(2);
    expect(experience[0].lines).toContain("2023.01-2023.06");
    expect(experience[1].title).toContain("美团");
    for (const line of nonBlank(text)) expect(reconstructResumeText(splitResumeBlocks(text))).toContain(line);
  });

  it("纯文本简历：日期开场行相邻无空行也拆成两卡", () => {
    const text = ["项目经历", "2023 A 项目", "内容A", "2022 B 项目", "内容B"].join("\n");
    const projects = splitResumeBlocks(text).filter((b) => b.kind === "project");
    expect(projects).toHaveLength(2);
    expect(projects[0].lines).toEqual(["2023 A 项目", "内容A"]);
    expect(projects[1].lines).toEqual(["2022 B 项目", "内容B"]);
  });

  it("描述行只是句中带年份，不会把同一条目劈成两卡", () => {
    const text = ["项目经历", "智能客服工作台", "接手于 2022 年的老系统，重构后 QPS 提升 40%", "并沉淀了评测集"].join("\n");
    const projects = splitResumeBlocks(text).filter((b) => b.kind === "project");
    expect(projects).toHaveLength(1);
    expect(projects[0].lines).toHaveLength(3);
  });
});

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
