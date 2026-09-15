import { applyResumeChanges, reviewAtsText, reviewPdfText } from "./application-quality";

describe("application package quality", () => {
  test("applies only accepted or pending exact-source changes", () => {
    const result = applyResumeChanges("负责产品上线\n其他经历", [{ id: "1", section: "经历", before: "负责产品上线", after: "推动产品上线", reason: "对应 JD", evidenceId: "claim-1", status: "accepted" }]);
    expect(result.text).toContain("推动产品上线");
    expect(result.findings).toEqual([]);
  });

  test("blocks a change whose original sentence cannot be found", () => {
    const result = applyResumeChanges("真实原文", [{ id: "1", section: "经历", before: "不存在", after: "新内容", reason: "", evidenceId: "claim-1", status: "accepted" }]);
    expect(result.findings[0].code).toBe("replacement_missed");
  });

  test("does not treat a section heading as resume source text", () => {
    const result = applyResumeChanges("腾讯｜产品经理\n负责模型评测和上线复盘", [{ id: "1", section: "实习经历 > 腾讯 | 产品经理", before: "实习经历 > 腾讯 | 产品经理", after: "腾讯｜AI 产品经理", reason: "岗位匹配", evidenceId: "claim-1", status: "accepted" }]);
    expect(result.text).toContain("腾讯｜产品经理");
    expect(result.findings).toEqual([expect.objectContaining({ code: "replacement_missed" })]);
  });

  test("flags PDF without a usable text layer", () => {
    expect(reviewPdfText("图片", "这是完整的简历正文，包含很多经历说明").ok).toBe(false);
  });

  test("macOS Chinese font radicals match the original Chinese resume", () => {
    const expected = "项目经历：知识助手验收项目，设计用户问题评测，记录结果与改进方案。".repeat(8);
    const extracted = expected.replace(/目/g,"⽬").replace(/手/g,"⼿").replace(/用/g,"⽤").replace(/方/g,"⽅");
    expect(reviewPdfText(extracted, expected)).toMatchObject({ok:true,overlap:1});
  });

  test("ATS review does not block a readable resume for warnings", () => {
    const result = reviewAtsText("产品经理\n负责 AI 产品需求分析、上线和迭代。".repeat(10), "招聘 AI 产品经理，负责需求分析与产品上线");
    expect(result.ok).toBe(true);
  });
});
