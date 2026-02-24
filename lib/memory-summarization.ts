/**
 * 记忆自动总结服务
 * 当对话过多时，自动总结压缩上下文
 */

import { callLLM } from './llm';
import { 
  saveMemorySummary, 
  markMessagesAsSummarized,
  getUnsummarizedMessages,
  shouldTriggerSummarization,
  type Stage 
} from './memory';

// 总结阈值：超过这个数量的消息触发总结
const SUMMARIZATION_THRESHOLD = 20;

// 总结Prompt
const SUMMARIZATION_PROMPT = `你是一个对话总结专家。请总结以下对话的关键信息，为后续对话提供上下文。

**总结要求：**
1. 保留所有重要的事实信息（职业目标、项目经历、技能、偏好等）
2. 去除闲聊和无关内容
3. 使用简洁的语言，按主题分类组织
4. 突出用户的核心需求和关键决策
5. 保留具体的数据和细节（如项目名称、技术栈、成果数据等）

**返回格式：**
使用Markdown格式，按以下结构组织：

## 核心信息
- 用户的主要目标和需求

## 职业规划
- 目标岗位、行业、公司类型
- 职业发展方向

## 项目经历
- 项目名称、技术栈、角色
- 主要成果和数据

## 技能优势
- 技术技能
- 软技能和特长

## 求职偏好
- 地点、薪资、公司规模等偏好

## 其他重要信息
- 其他值得记录的信息

**注意：**
- 如果某个部分没有信息，可以省略该部分
- 保持简洁，每个要点1-2句话
- 使用列表格式，便于阅读`;

/**
 * 检查并在需要时触发总结
 */
export async function checkAndSummarizeIfNeeded(params: {
  userId: string;
  stage: Stage;
}): Promise<void> {
  try {
    // 检查是否需要总结
    const needsSummarization = await shouldTriggerSummarization(
      params.userId,
      params.stage,
      SUMMARIZATION_THRESHOLD
    );

    if (!needsSummarization) {
      return;
    }

    console.log(`触发自动总结：用户 ${params.userId}，阶段 ${params.stage}`);

    // 执行总结
    await summarizeConversation(params);
  } catch (error) {
    console.error('检查并总结失败:', error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 总结对话
 */
export async function summarizeConversation(params: {
  userId: string;
  stage: Stage;
}): Promise<string | null> {
  try {
    // 获取未总结的消息
    const messages = await getUnsummarizedMessages(
      params.userId,
      params.stage
    );

    if (messages.length === 0) {
      console.log('没有需要总结的消息');
      return null;
    }

    console.log(`开始总结 ${messages.length} 条消息...`);

    // 构建对话文本
    const conversationText = messages
      .map(m => {
        const speaker = m.role === 'user' ? '用户' : 
                       m.role === 'assistant' ? 'AI' : '系统';
        return `${speaker}: ${m.content}`;
      })
      .join('\n\n');

    // 调用LLM生成总结
    const summary = await callLLM(
      [
        { role: 'system', content: SUMMARIZATION_PROMPT },
        { 
          role: 'user', 
          content: `请总结以下对话：\n\n${conversationText}` 
        },
      ],
      {
        temperature: 0.3,
        maxTokens: 1500,
      }
    );

    // 估算token数（粗略估计：中文1字≈2tokens）
    const estimatedTokens = Math.ceil(summary.length * 1.5);

    // 保存总结
    const summaryId = await saveMemorySummary({
      userId: params.userId,
      stage: params.stage,
      summaryContent: summary,
      messageCount: messages.length,
      tokenCount: estimatedTokens,
    });

    // 标记消息为已总结
    const messageIds = messages.map(m => m.id);
    await markMessagesAsSummarized(messageIds, summaryId);

    console.log(`✓ 成功总结 ${messages.length} 条消息，token数: ${estimatedTokens}`);
    return summary;
  } catch (error) {
    console.error('总结对话失败:', error);
    return null;
  }
}

/**
 * 手动触发总结（用于测试或管理）
 */
export async function manualSummarize(params: {
  userId: string;
  stage: Stage;
  force?: boolean; // 强制总结，即使消息数不足阈值
}): Promise<string | null> {
  if (!params.force) {
    const needsSummarization = await shouldTriggerSummarization(
      params.userId,
      params.stage,
      SUMMARIZATION_THRESHOLD
    );

    if (!needsSummarization) {
      console.log('消息数未达到阈值，跳过总结');
      return null;
    }
  }

  return await summarizeConversation(params);
}

/**
 * 获取总结统计信息
 */
export async function getSummarizationStats(params: {
  userId: string;
  stage: Stage;
}): Promise<{
  unsummarizedCount: number;
  needsSummarization: boolean;
  threshold: number;
}> {
  const unsummarizedCount = await getUnsummarizedMessages(
    params.userId,
    params.stage
  ).then(msgs => msgs.length);

  return {
    unsummarizedCount,
    needsSummarization: unsummarizedCount >= SUMMARIZATION_THRESHOLD,
    threshold: SUMMARIZATION_THRESHOLD,
  };
}
