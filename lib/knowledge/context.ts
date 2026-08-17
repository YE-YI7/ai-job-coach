import { knowledgeBaseMetadata, retrieveKnowledgeDocuments } from "./document-repository";
import type { AgentKnowledgeContext, AgentKnowledgeTask } from "./types";

const MAX_CONTEXT_CHARS = 6_500;

export async function buildAgentKnowledgeContext(input: {
  task: AgentKnowledgeTask;
  query?: string | null;
  role?: string | null;
  company?: string | null;
  stage?: string | null;
  limit?: number;
}): Promise<AgentKnowledgeContext> {
  const items = retrieveKnowledgeDocuments({
    task: input.task,
    query: input.query,
    role: input.role,
    company: input.company,
    stage: input.stage,
    limit: input.limit || 4,
  });

  if (!items.length) return { task: input.task, items: [], contextText: "" };

  const entries = items.map((item, index) => {
    const evidence = item.evidence
      .slice(0, 4)
      .map((source) => `${source.title}（${source.platform}）${source.url}`)
      .join("；");
    const lines = [
      `[KNOWLEDGE${index + 1}] ${item.title}`,
      `Description：${item.description}`,
      `Goal：${item.goal}`,
      `适用范围：${item.scope}`,
      item.roles.length ? `适用岗位：${item.roles.join("、")}` : "",
      item.stages.length ? `适用阶段：${item.stages.join("、")}` : "",
      item.useWhen.length ? `适合使用：${item.useWhen.join("；")}` : "",
      item.doNotUseWhen.length ? `不要用于：${item.doNotUseWhen.join("；")}` : "",
      `知识正文：\n${item.content}`,
      evidence ? `证据来源：${evidence}` : "",
      `置信度：${item.confidence}；复核日期：${item.reviewedAt}`,
    ].filter(Boolean);
    return lines.join("\n");
  });

  const contextText = `【益职内部求职知识库】
Description：${knowledgeBaseMetadata.description}
Goal：${knowledgeBaseMetadata.goal}
使用规则：
1. 先以当前 JD、用户简历、真实回答和已确认记忆为准，再用知识补充追问和校准建议。
2. 知识文档是多条证据的提炼；底层个体面经仍不能证明岗位必考或公司固定规则。
3. 不得把外部案例、数字或成果写成用户经历；证据不足时明确标记假设。
4. 不向用户展示“情报列表”；只有结论依赖外部知识或用户追问时，才自然说明来源。

${entries.join("\n\n")}`.slice(0, MAX_CONTEXT_CHARS);

  return { task: input.task, items, contextText };
}

export type { AgentKnowledgeContext, AgentKnowledgeDocument, AgentKnowledgeItem, AgentKnowledgeTask } from "./types";
