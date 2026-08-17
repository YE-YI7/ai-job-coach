import { buildAgentKnowledgeContext } from "./context";
import { knowledgeBaseMetadata, retrieveKnowledgeDocuments } from "./document-repository";

describe("knowledge document repository", () => {
  it("retrieves a synthesized product interview document instead of a raw source record", () => {
    const documents = retrieveKnowledgeDocuments({
      task: "mock_interview",
      query: "小红书 产品经理 一面 用户研究 活跃度归因",
      company: "小红书",
      role: "产品经理",
      stage: "一面",
      limit: 3,
    });

    expect(documents[0]?.id).toBe("pm.interview-core.v1");
    expect(documents[0]?.description).toContain("用户研究");
    expect(documents[0]?.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("retrieves transition knowledge for an engineering-to-product resume", () => {
    const documents = retrieveKnowledgeDocuments({
      task: "resume_tailoring",
      query: "软件工程师转产品经理，怎么重组项目经历",
      role: "产品经理",
      stage: "转岗",
      limit: 2,
    });

    expect(documents[0]?.id).toBe("pm.transition-from-engineering.v1");
    expect(documents[0]?.doNotUseWhen.join(" ")).toContain("真实商业项目");
  });

  it("builds bounded Agent context with the knowledge base Description and Goal", async () => {
    const context = await buildAgentKnowledgeContext({
      task: "interview_review",
      query: "产品经理业务面复盘",
      role: "产品经理",
      limit: 3,
    });

    expect(context.contextText).toContain(`Description：${knowledgeBaseMetadata.description}`);
    expect(context.contextText).toContain(`Goal：${knowledgeBaseMetadata.goal}`);
    expect(context.contextText).toContain("知识正文");
    expect(context.contextText.length).toBeLessThanOrEqual(6_500);
  });
});
