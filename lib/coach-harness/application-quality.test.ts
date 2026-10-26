import { applyResumeChanges, reviewAtsText, reviewPdfText, atsReviewSummary, presentResumeAtsQuality } from "./application-quality";

test('empty or unusable JD has no measured keyword coverage, never 100%', () => {
  for (const jd of ['', '   ', '。。。']) {
    const result = reviewAtsText('分析业务需求并整理原型。', jd);
    expect(result.coverage).toBeNull();
    expect(atsReviewSummary(result)).toContain('匹配未测');
    expect(atsReviewSummary(result)).not.toContain('100%');
  }
});

test('legacy product projection hides empty-JD 100% without changing the stored evidence', () => {
  const raw = { status: 'ready', reviews: [
    { reviewerType: 'ats', status: 'passed', summary: '文本可解析；岗位词覆盖 100%。' },
    { reviewerType: 'facts', status: 'passed', summary: '原始事实检查' },
  ] };
  const shown = presentResumeAtsQuality(raw, '');
  expect(shown.reviews[0].summary).toContain('匹配未测');
  expect(raw.reviews[0].summary).toContain('100%');
  expect(shown.reviews[1]).toBe(raw.reviews[1]);
  expect(presentResumeAtsQuality(raw, '产品经理')).toBe(raw);
});

describe("application package quality", () => {
  const change = (before: string, after: string, id = "one") => ({ id, section: "项目经历", before, after, reason: "", evidenceId: null, status: "accepted" as const });
  test("tolerates PDF whitespace while preserving surrounding text", () => {
    const result = applyResumeChanges("标题\n负责产品需求   分析\n与上线复盘\n尾注", [change("负责产品需求 分析 与上线复盘", "设计产品上线方案")]);
    expect(result).toEqual({ text: "标题\n设计产品上线方案\n尾注", findings: [] });
  });
  test("does not choose the first of duplicate anchors", () => {
    const source = "负责产品上线\n负责产品上线";
    expect(applyResumeChanges(source, [change("负责产品上线", "不同经历")])).toMatchObject({ text: source, findings: [expect.objectContaining({ changeId: "one" })] });
  });
  test("replacement strings are literal, not dollar substitutions", () => {
    expect(applyResumeChanges("项目原文", [change("项目原文", "$& $1 $100")]).text).toBe("$& $1 $100");
  });
  test("never locates a second suggestion in generated text", () => {
    const result = applyResumeChanges("甲项目", [change("甲项目", "乙项目"), change("乙项目", "丙项目", "two")]);
    expect(result.text).toBe("乙项目");
    expect(result.findings[0].changeId).toBe("two");
  });
  test("overlapping edits both remain unapplied", () => {
    const result = applyResumeChanges("负责产品上线及复盘", [change("负责产品上线", "第一版"), change("产品上线及复盘", "第二版", "two")]);
    expect(result.text).toBe("负责产品上线及复盘");
    expect(result.findings).toHaveLength(2);
  });
  test("retaining all original text is valid", () => {
    expect(applyResumeChanges("原文", [{ ...change("不存在", "不采用"), status: "rejected" }])).toEqual({ text: "原文", findings: [] });
  });
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
