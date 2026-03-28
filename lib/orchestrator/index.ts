/**
 * 多模型编排器
 * 根据用户当前阶段自动选择对应的模型，并解析阶段完成度评估
 */

import { runStageModel } from "./stageAgent";

export type StageEvaluation = {
  completion: number;       // 0-100 阶段完成度
  reason: string;           // 判断依据
  should_advance: boolean;  // 是否建议进入下一阶段
};

export type OrchestratorResult = {
  reply: string;            // 给用户的回复（已去除评估 JSON）
  structured: any;          // 白板数据结构
  stageEval?: StageEvaluation;  // 阶段完成度评估
};

export type OrchestratorInput = {
  userStage: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

/**
 * 从 AI 回复中解析并剥离 stage_eval JSON 块
 */
function extractStageEval(reply: string): { cleanReply: string; eval?: StageEvaluation } {
  const evalRegex = /```stage_eval\s*\n?([\s\S]*?)\n?```/;
  const match = reply.match(evalRegex);

  if (!match) {
    return { cleanReply: reply };
  }

  try {
    const evalData = JSON.parse(match[1].trim());
    const cleanReply = reply.replace(evalRegex, "").trim();
    return {
      cleanReply,
      eval: {
        completion: Math.max(0, Math.min(100, Number(evalData.completion) || 0)),
        reason: String(evalData.reason || ""),
        should_advance: Boolean(evalData.should_advance),
      },
    };
  } catch {
    // JSON 解析失败，返回原始回复
    return { cleanReply: reply.replace(evalRegex, "").trim() };
  }
}

/**
 * 运行编排器，根据阶段选择对应的模型
 */
export async function runOrchestrator({
  userStage,
  messages,
}: OrchestratorInput): Promise<OrchestratorResult> {
  const result = await runStageModel(userStage, messages);

  // 解析阶段完成度评估并从回复中剥离
  const { cleanReply, eval: stageEval } = extractStageEval(result.reply);

  return {
    reply: cleanReply,
    structured: result.structured,
    stageEval,
  };
}
