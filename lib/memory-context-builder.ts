/**
 * 跨阶段记忆上下文构建器
 * 
 * 三层记忆架构（参考 ChatGPT Memory / mem0 / LangChain SummaryBufferMemory）：
 * 1. 短期记忆（Working Memory）：当前对话的 messages，由前端传入
 * 2. 结构化记忆（Semantic Memory）：LLM 从历史对话中提取的关键事实，存储在 user_memories 表
 * 3. 压缩记忆（Episodic Summary）：历史对话的自动总结摘要，存储在 memory_summaries 表
 * 
 * 本模块负责：
 * - 查询跨阶段结构化记忆 + 当前阶段历史总结
 * - 智能筛选与当前阶段最相关的记忆
 * - 将记忆格式化并注入 system prompt，避免上下文过载
 */

import { 
  getCrossStageMemories, 
  getUserMemories,
  getLatestSummary,
  getAllSummaries,
  formatMemoriesForContext,
  type Stage, 
  type Memory, 
  type MemorySummary 
} from './memory';
import type { UserStage } from './stage';

// ==================== 阶段映射 ====================

// 将前端 UserStage 映射到记忆系统的 Stage
const STAGE_TO_MEMORY_STAGE: Record<string, Stage> = {
  career_planning: 'career',
  project_review: 'project',
  resume_optimization: 'resume',
  application_strategy: 'delivery',
  interview: 'interview',
  salary_talk: 'salary',
  offer: 'offer',
  // 直接映射（兼容）
  career: 'career',
  project: 'project',
  resume: 'resume',
  delivery: 'delivery',
  salary: 'salary',
};

export function toMemoryStage(stage: string): Stage {
  return STAGE_TO_MEMORY_STAGE[stage] || 'career';
}

// ==================== 阶段关联度矩阵 ====================

// 定义各阶段之间的记忆关联度权重（0-1）
// 越高表示前一阶段的记忆对当前阶段越重要
const STAGE_RELEVANCE: Record<Stage, Record<Stage, number>> = {
  career: { career: 1, project: 0.3, resume: 0.2, delivery: 0.2, interview: 0.1, salary: 0.1, offer: 0.1 },
  project: { career: 0.9, project: 1, resume: 0.3, delivery: 0.2, interview: 0.3, salary: 0.1, offer: 0.1 },
  resume: { career: 0.8, project: 0.9, resume: 1, delivery: 0.3, interview: 0.3, salary: 0.2, offer: 0.1 },
  delivery: { career: 0.7, project: 0.5, resume: 0.8, delivery: 1, interview: 0.2, salary: 0.3, offer: 0.2 },
  interview: { career: 0.6, project: 0.8, resume: 0.7, delivery: 0.4, interview: 1, salary: 0.3, offer: 0.2 },
  salary: { career: 0.5, project: 0.4, resume: 0.3, delivery: 0.3, interview: 0.6, salary: 1, offer: 0.7 },
  offer: { career: 0.6, project: 0.3, resume: 0.3, delivery: 0.3, interview: 0.5, salary: 0.8, offer: 1 },
};

// ==================== Token 预算控制 ====================

// 记忆注入的 Token 预算（避免上下文过载）
const MEMORY_TOKEN_BUDGET = 800; // 大约 400 个中文字

// 粗略估算文本 token 数（中文 1 字 ≈ 1.5 token）
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.5);
}

// ==================== 核心构建逻辑 ====================

export interface MemoryContext {
  /** 注入到 system prompt 中的记忆文本 */
  contextText: string;
  /** 使用的记忆条数 */
  memoriesUsed: number;
  /** 使用的总结数 */
  summariesUsed: number;
  /** 估算的 token 数 */
  estimatedTokens: number;
}

/**
 * 构建跨阶段记忆上下文
 * 
 * 策略：
 * 1. 获取跨阶段高重要性记忆（importance >= 7），按关联度加权排序
 * 2. 获取当前阶段的最新对话总结（如有）
 * 3. 在 Token 预算内，优先放入关联度最高的记忆
 * 4. 格式化为简洁的背景信息文本
 */
export async function buildMemoryContext(
  userId: string,
  currentStage: string
): Promise<MemoryContext> {
  const memoryStage = toMemoryStage(currentStage);
  
  try {
    // 并行查询记忆和总结
    const [crossMemories, currentStageMemories, latestSummaries] = await Promise.all([
      getCrossStageMemories(userId, memoryStage, 20),
      getUserMemories(userId, memoryStage),
      getAllSummaries(userId), // 获取所有阶段的总结
    ]);

    // 如果没有任何记忆和总结，直接返回空
    if (crossMemories.length === 0 && currentStageMemories.length === 0 && latestSummaries.length === 0) {
      return { contextText: '', memoriesUsed: 0, summariesUsed: 0, estimatedTokens: 0 };
    }

    let contextParts: string[] = [];
    let totalTokens = 0;
    let memoriesUsed = 0;
    let summariesUsed = 0;

    // === 第一部分：跨阶段关键记忆 ===
    if (crossMemories.length > 0) {
      // 按关联度加权排序
      const scoredMemories = crossMemories.map(mem => ({
        memory: mem,
        score: (mem.importance / 10) * (STAGE_RELEVANCE[memoryStage]?.[mem.stage as Stage] || 0.3),
      })).sort((a, b) => b.score - a.score);

      // 在预算内选择最相关的记忆
      const selectedMemories: Memory[] = [];
      let memoryTokenBudget = MEMORY_TOKEN_BUDGET * 0.6; // 60% 预算给跨阶段记忆

      for (const { memory } of scoredMemories) {
        const contentStr = typeof memory.content === 'string' 
          ? memory.content 
          : JSON.stringify(memory.content);
        const tokens = estimateTokens(contentStr);
        
        if (totalTokens + tokens > memoryTokenBudget) break;
        
        selectedMemories.push(memory);
        totalTokens += tokens;
        memoriesUsed++;
      }

      if (selectedMemories.length > 0) {
        const formattedMemories = formatMemoriesForContext(selectedMemories);
        if (formattedMemories) {
          contextParts.push(formattedMemories);
        }
      }
    }

    // === 第二部分：其他阶段的最新总结（压缩记忆）===
    if (latestSummaries.length > 0) {
      const summaryTokenBudget = MEMORY_TOKEN_BUDGET * 0.4; // 40% 预算给总结
      let summaryTokensUsed = 0;

      // 按关联度排序总结
      const scoredSummaries = latestSummaries
        .filter(s => s.stage !== memoryStage) // 排除当前阶段
        .map(s => ({
          summary: s,
          relevance: STAGE_RELEVANCE[memoryStage]?.[s.stage as Stage] || 0.3,
        }))
        .sort((a, b) => b.relevance - a.relevance);

      const stageLabels: Record<string, string> = {
        career: '职业规划', project: '项目梳理', resume: '简历优化',
        delivery: '投递策略', interview: '模拟面试', salary: '薪资沟通', offer: 'Offer评估',
      };

      const summaryLines: string[] = [];
      for (const { summary } of scoredSummaries) {
        const tokens = estimateTokens(summary.summary_content);
        if (summaryTokensUsed + tokens > summaryTokenBudget) break;

        const label = stageLabels[summary.stage] || summary.stage;
        // 截取总结的核心部分（最多200字）
        const truncated = summary.summary_content.length > 200 
          ? summary.summary_content.substring(0, 200) + '...'
          : summary.summary_content;
        summaryLines.push(`[${label}阶段] ${truncated}`);
        summaryTokensUsed += Math.min(tokens, estimateTokens(truncated));
        summariesUsed++;
      }

      if (summaryLines.length > 0) {
        contextParts.push('\n【历史对话摘要】\n' + summaryLines.join('\n'));
        totalTokens += summaryTokensUsed;
      }
    }

    // 组装最终上下文
    const contextText = contextParts.length > 0
      ? '\n\n---\n以下是该用户在其他求职阶段中积累的关键信息，请在回复时参考这些背景（但不要主动提及这些信息，除非与当前话题直接相关）：\n' + contextParts.join('\n')
      : '';

    return {
      contextText,
      memoriesUsed,
      summariesUsed,
      estimatedTokens: totalTokens,
    };
  } catch (error) {
    console.error('构建记忆上下文失败:', error);
    // 静默失败，不影响主流程
    return { contextText: '', memoriesUsed: 0, summariesUsed: 0, estimatedTokens: 0 };
  }
}

/**
 * 将记忆上下文注入到 system prompt 中
 */
export function injectMemoryIntoPrompt(systemPrompt: string, memoryContext: MemoryContext): string {
  if (!memoryContext.contextText) {
    return systemPrompt;
  }
  
  // 在 system prompt 末尾追加记忆上下文
  return systemPrompt + memoryContext.contextText;
}
