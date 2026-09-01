import { mergeOpportunityMaterial, shareBaseResumeAcrossOpportunities } from "./material-intake";

describe("mergeOpportunityMaterial", () => {
  test("adds a resume without replacing the saved JD", () => {
    expect(mergeOpportunityMaterial({
      kind: "resume",
      sourceText: "用户简历原文",
      jdText: "岗位要求原文",
      resumeText: "",
    })).toEqual({ jdText: "岗位要求原文", resumeText: "用户简历原文" });
  });

  test("adds a JD without replacing the saved resume", () => {
    expect(mergeOpportunityMaterial({
      kind: "job",
      sourceText: "新岗位要求",
      jdText: "",
      resumeText: "用户简历原文",
    })).toEqual({ jdText: "新岗位要求", resumeText: "用户简历原文" });
  });

  test("appends extra experience to the factual resume source", () => {
    expect(mergeOpportunityMaterial({
      kind: "experience",
      sourceText: "补充项目经历",
      jdText: "岗位要求",
      resumeText: "已有简历",
    }).resumeText).toBe("已有简历\n\n补充项目经历");
  });

  test("reuses the base resume in every job that does not yet have one", () => {
    const opportunities = [
      { id: "resume", workspaceType: "preparation" as const, resumeText: "基础简历", profileText: "个人背景" },
      { id: "job-a", workspaceType: "job" as const, resumeText: "" },
      { id: "job-b", workspaceType: "job" as const, resumeText: "岗位专用简历" },
    ];
    const shared = shareBaseResumeAcrossOpportunities(opportunities);
    expect(shared[1]).toMatchObject({ resumeText: "基础简历", profileText: "个人背景" });
    expect(shared[2]).toMatchObject({ resumeText: "岗位专用简历" });
  });
});
