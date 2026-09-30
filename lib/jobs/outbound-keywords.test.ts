import { outboundKeywords } from "./outbound-keywords";
import { MAX_KEYWORDS } from "@/lib/coach-harness/subagents/retrieval";

const resume = (text: string) => ({ role: "产品经理", resumeText: text });

test("中文方向出网前先翻成词表里的英文岗位名", () => {
  const { keywords } = outboundKeywords({ role: "AI 产品经理", resumeText: "会写 SQL" });
  expect(keywords).toContain("product manager");
  expect(keywords).toContain("sql");
});

test("简历正文一个字都不出网：连姓名、学校、前雇主、电话邮箱都不进查询", () => {
  const privateResume = [
    "郭小明 13800138000 guoxiaoming@example.com",
    "北京大学 信息管理学 本科",
    "字节跳动 产品经理 2021-2024，负责抖音电商推荐",
    "项目：内部工具 Dashboard，用 SQL 取数，Python 做分析",
  ].join("\n");
  const { keywords } = outboundKeywords({ role: "产品经理", resumeText: privateResume });
  for (const leak of ["郭小明", "13800138000", "guoxiaoming", "北京大学", "字节跳动", "抖音", "Dashboard"]) {
    expect(keywords.join(" ")).not.toContain(leak);
  }
  // 简历对出网词的唯一贡献 = 词表里那几个固定技能词
  expect(keywords.filter((word) => word.includes("python"))).toEqual(["python"]);
});

test("方向那句里带着姓名电话邮箱：剥完才许出网，剥不干净就挡下", () => {
  const pii = { names: ["郭小明"], companies: ["字节跳动"] };
  const { keywords } = outboundKeywords({ role: "产品经理 郭小明 13800138000 hr@acme.com", resumeText: "会 SQL", pii });
  expect(keywords.join(" ")).not.toMatch(/郭小明|13800138000|hr@acme/);
  expect(keywords.some((word) => word.includes("product manager"))).toBe(true);
});

test("认不出的方向就把用户自己那句原样带出去（过闸之后）", () => {
  const { keywords } = outboundKeywords(resume(""));
  const odd = outboundKeywords({ role: "增长投放专员", resumeText: "" });
  expect(odd.keywords).toContain("增长投放专员");
  expect(keywords).toContain("产品经理");
});

test("超长候选进 blocked；整句被剥光则什么都不留（不在 blocked 里留 PII 副本）", () => {
  const long = "产品经理".repeat(40);
  expect(outboundKeywords({ role: long, resumeText: "" }).blocked).toContain(long);
  const digits = outboundKeywords({ role: "13800138000", resumeText: "", pii: { names: [], companies: [] } });
  expect(digits).toEqual({ keywords: [], blocked: [] });
});

test("条数封顶：扇出预算不会随风向句越写越长而失控", () => {
  const { keywords } = outboundKeywords({
    role: "产品经理 / 项目管理 / 数据分析 / 用户研究 / 需求分析 / 运营 / 销售 / 设计 / 工程师",
    resumeText: "python sql typescript react llm agent rag 机器学习",
  });
  expect(keywords.length).toBeLessThanOrEqual(MAX_KEYWORDS);
  const capped = outboundKeywords({ role: "产品经理", resumeText: "python sql typescript react", limit: 2 });
  expect(capped.keywords).toHaveLength(2);
});
