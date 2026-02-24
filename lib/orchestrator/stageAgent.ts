/**
 * 统一的阶段 Agent 路由
 * 根据用户阶段自动选择对应的 orchestrator model（已嵌入提示词）
 * 
 * LangChain disabled - 所有 LangChain 相关逻辑已注释
 */

/* LangChain disabled
import { runDeepSeekCareer } from "./models/career_planning";
import { runDeepSeekProjectReview } from "./models/project_review";
import { runDeepSeekResume } from "./models/resume_optimization";
import { runDeepSeekStrategy } from "./models/application_strategy";
import { runDeepSeekInterview } from "./models/interview";
import { runDeepSeekSalary } from "./models/salary_talk";
import { runDeepSeekOffer } from "./models/offer";
*/

export type UserStage =
  | "career_planning"
  | "project_review"
  | "resume_optimization"
  | "application_strategy"
  | "interview"
  | "salary_talk"
  | "offer";

/**
 * 根据阶段运行对应的模型（已嵌入对应提示词）
 * @param stage 用户当前阶段
 * @param messages 对话消息数组
 * @returns 模型返回结果（包含 reply 和 structured 数据）
 * 
 * LangChain disabled - 暂时禁用所有子模块调用
 */
export async function runStageModel(
  stage: UserStage | string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
) {
  /* LangChain disabled
  // 标准化阶段名称（处理可能的变体）
  const normalizedStage = normalizeStage(stage);

  switch (normalizedStage) {
    case "career_planning":
      return await runDeepSeekCareer(messages);
    case "project_review":
      return await runDeepSeekProjectReview(messages);
    case "resume_optimization":
      return await runDeepSeekResume(messages);
    case "application_strategy":
      return await runDeepSeekStrategy(messages);
    case "interview":
      return await runDeepSeekInterview(messages);
    case "salary_talk":
      return await runDeepSeekSalary(messages);
    case "offer":
      return await runDeepSeekOffer(messages);
    default:
      // 默认使用职业规划模型
      console.warn(`未知阶段 "${stage}"，使用默认职业规划模型`);
      return await runDeepSeekCareer(messages);
  }
  */

  // 暂时禁用所有子模块调用，返回简单的 passthrough
  const lastMessage = messages[messages.length - 1];
  return {
    reply: lastMessage?.content || "",
    structured: {}
  };
}

/**
 * 标准化阶段名称（处理可能的变体）
 * 
 * LangChain disabled - 已注释
 */
/* LangChain disabled
function normalizeStage(stage: string): UserStage {
  const stageMap: Record<string, UserStage> = {
    career: "career_planning",
    career_planning: "career_planning",
    project: "project_review",
    project_review: "project_review",
    resume: "resume_optimization",
    resume_optimization: "resume_optimization",
    application: "application_strategy",
    application_strategy: "application_strategy",
    interview: "interview",
    salary: "salary_talk",
    salary_talk: "salary_talk",
    offer: "offer",
  };

  return stageMap[stage.toLowerCase()] || "career_planning";
}
*/

