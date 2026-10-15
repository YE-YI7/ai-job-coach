import { retrieveResumeExamples, inferResumeStage, renderResumeKnowledge } from "./resume-examples";
import { retrieveKnowledgeDocuments, reviewedResumeExamples } from "./document-repository";

describe("reviewed résumé examples", () => {
  test("selects a close computational HCI background, not a biology or senior sample", () => {
    const matches = retrieveResumeExamples({resume:"计算机专业在读，软件开发实习。参与用户界面研究与搜索工具开发。",target:"AI 产品经理"});
    expect(matches[0].document.id).toBe("resume.example.computing-hci.v1");
    expect(matches[0].stageMatched).toBe(true);
    expect(matches.every(item => item.matchedDimensions.length >= 2)).toBe(true);
    expect(matches.map(item=>item.document.id)).not.toContain("resume.example.biology-consulting.v1");
  });
  test("JD keywords and a single Python skill do not manufacture background similarity", () => {
    expect(retrieveResumeExamples({resume:"门店收银与补货，熟悉 Python。",target:"计算机研究、软件开发、HCI搜索、金融策略、医药访谈"})).toEqual([]);
  });
  test("matches biology and advertising independently, including no-JD editing", () => {
    expect(retrieveResumeExamples({resume:"生物本科应届，在实验室做研究助理，并参加医药咨询访谈。"})[0].document.id).toBe("resume.example.biology-consulting.v1");
    expect(retrieveResumeExamples({resume:"数学专业实习生，负责广告竞价数据分析和实验设计。"})[0].document.id).toBe("resume.example.advertising-analysis.v1");
  });
  test("experienced users are not forced into student examples; education alone is not current stage", () => {
    expect(inferResumeStage("计算机本科毕业，5年工作经验，负责软件开发与搜索")).toBe("experienced");
    expect(retrieveResumeExamples({resume:"计算机本科毕业，5年工作经验，负责软件开发与搜索"})).toEqual([]);
    expect(inferResumeStage("计算机本科学历，软件开发")).toBeNull();
    expect(retrieveResumeExamples({resume:"金融 MBA，8年工作经验，负责战略投资分析并向管理层汇报。"})[0].document.id).toBe("resume.example.senior-strategy.v1");
  });
  test("generic task retrieval cannot bypass case-specific background gates", () => {
    expect(retrieveKnowledgeDocuments({task:"resume_tailoring",query:"HCI 医药 金融 广告",limit:8}).some(doc=>doc.resumeProfile)).toBe(false);
  });
  test("all curated examples carry source, review basis, limitations and no personal identity", () => {
    const docs=reviewedResumeExamples(); expect(docs).toHaveLength(4);
    for(const doc of docs){expect(doc.resumeProfile?.outcomeVerified).toBe(false);expect(doc.resumeProfile?.reviewBasis.length).toBeGreaterThanOrEqual(2);expect(doc.evidence[0].url).toMatch(/^https:/);}
    const prompt=renderResumeKnowledge(docs);
    expect(prompt).toContain("绝不能成为用户经历或 sourceIds");
    expect(prompt).not.toMatch(/@|617[-.]|Charles St|Matha Maddox|JANE DOE/);
  });
});
