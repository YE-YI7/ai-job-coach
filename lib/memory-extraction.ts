/**
 * 记忆提取服务
 * 使用 LLM 从对话中智能提取关键信息
 *
 * 优化策略：
 * 1. 批量提取 — 积攒 N 轮对话后一次性提取，减少 LLM 调用
 * 2. 去重合并 — 提取前查询已有记忆，提示 LLM 只提取新增/变更信息
 * 3. 冲突解决 — 同类型记忆发现冲突时，更新旧记忆而非重复插入
 */

import { callLLM } from './llm';
import {
  saveMemory,
  saveMemories,
  getUserMemories,
  updateMemory,
  type Stage,
  type MemoryType,
  type Memory,
} from './memory';

// ==================== 批量缓冲区 ====================

interface PendingTurn {
  userMessage: string;
  aiResponse: string;
  timestamp: number;
}

// 进程内缓冲区：userId:stage → 待处理对话轮次
const pendingTurns = new Map<string, PendingTurn[]>();

// 积攒轮次阈值（达到后触发批量提取）
const BATCH_THRESHOLD = 3;

// 最大等待时间（ms），超过后无论轮次数都触发提取
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 分钟

// ==================== 提取 Prompt ====================

const EXTRACTION_PROMPT = `你是一个信息提取专家。从用户和AI的对话中提取关键信息，用于后续阶段的个性化指导。

请提取以下类型的信息（如果存在）：

1. **career_goal** (职业目标) — 目标岗位、行业、公司类型、职业发展方向
2. **project_detail** (项目细节) — 项目名称、技术栈、个人角色、成果数据
3. **skill** (技能优势) — 技术技能、软技能、特长
4. **preference** (求职偏好) — 期望地点、公司规模、工作方式、行业偏好
5. **company_target** (目标公司) — 具体公司名称、公司类型
6. **salary_expect** (薪资期望) — 期望薪资、当前薪资
7. **interview_exp** (面试经验) — 面试经历、反馈
8. **education** (教育背景) — 学历、专业、学校
9. **work_exp** (工作经验) — 公司、职位、主要职责

**提取规则：**
- 只提取明确提到的信息，不要推测
- 每条记忆应该简洁明了
- 为每条记忆评估重要性（1-10分）
  * 9-10分：核心信息（职业目标、关键项目）
  * 7-8分：重要信息（技能、偏好）
  * 5-6分：一般信息（补充细节）
  * 1-4分：次要信息

**返回JSON格式：**
\`\`\`json
{
  "memories": [
    {
      "type": "career_goal",
      "content": { "target_role": "Java后端", "target_industry": "互联网" },
      "importance": 9,
      "action": "new"
    }
  ]
}
\`\`\`

action 字段说明：
- "new": 全新信息，需要新增
- "update": 用户更新了已有信息（如改变了目标岗位），需要替换旧记忆
- "skip": 已有记忆中已存在相同信息，无需重复保存

如果没有任何新信息，返回：
\`\`\`json
{"memories": []}
\`\`\``;

// ==================== 公共接口 ====================

/**
 * 从对话中提取记忆（批量版本）
 * 完整对话提取，保留兼容性
 */
export async function extractMemoriesFromConversation(params: {
  userId: string;
  stage: Stage;
  messages: Array<{ role: string; content: string }>;
}): Promise<void> {
  try {
    const conversationMessages = params.messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );
    if (conversationMessages.length === 0) return;

    const conversationText = conversationMessages
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n\n');

    // 获取已有记忆用于去重
    const existingMemories = await getUserMemories(params.userId);
    const existingContext = formatExistingMemories(existingMemories);

    const response = await callLLM(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        {
          role: 'user',
          content: `${existingContext}\n\n请从以下对话中提取【新增或变更】的关键信息：\n\n${conversationText}`,
        },
      ],
      { temperature: 0.3, maxTokens: 2000 }
    );

    const result = parseExtractedJSON(response);
    if (result?.memories?.length > 0) {
      await saveExtractedMemories(params.userId, params.stage, result.memories, existingMemories);
    }
  } catch (error) {
    console.error('记忆提取失败:', error);
  }
}

/**
 * 单轮消息快速记忆提取（批量缓冲版）
 * 不再每轮调用 LLM，而是积攒到阈值后批量处理
 */
export async function quickExtractFromMessage(params: {
  userId: string;
  stage: Stage;
  userMessage: string;
  aiResponse: string;
}): Promise<void> {
  const bufferKey = `${params.userId}:${params.stage}`;

  // 追加到缓冲区
  if (!pendingTurns.has(bufferKey)) {
    pendingTurns.set(bufferKey, []);
  }
  const buffer = pendingTurns.get(bufferKey)!;
  buffer.push({
    userMessage: params.userMessage,
    aiResponse: params.aiResponse,
    timestamp: Date.now(),
  });

  // 判断是否需要触发提取
  const shouldFlush =
    buffer.length >= BATCH_THRESHOLD ||
    (buffer.length > 0 && Date.now() - buffer[0].timestamp > MAX_WAIT_MS);

  if (!shouldFlush) {
    return; // 继续积攒
  }

  // 取出缓冲区并清空
  const turnsToProcess = [...buffer];
  pendingTurns.delete(bufferKey);

  // 异步批量提取
  try {
    await batchExtract(params.userId, params.stage, turnsToProcess);
  } catch (error) {
    console.error('[Memory] 批量记忆提取失败:', error);
  }
}

/**
 * 强制刷新某用户某阶段的缓冲区（用于阶段切换或会话结束时）
 */
export async function flushPendingExtractions(userId: string, stage: Stage): Promise<void> {
  const bufferKey = `${userId}:${stage}`;
  const buffer = pendingTurns.get(bufferKey);
  if (!buffer || buffer.length === 0) return;

  const turnsToProcess = [...buffer];
  pendingTurns.delete(bufferKey);

  try {
    await batchExtract(userId, stage, turnsToProcess);
  } catch (error) {
    console.error('[Memory] flush 记忆提取失败:', error);
  }
}

// ==================== 内部实现 ====================

/**
 * 批量提取：将多轮对话拼接后一次性调用 LLM 提取
 */
async function batchExtract(
  userId: string,
  stage: Stage,
  turns: PendingTurn[]
): Promise<void> {
  // 拼接多轮对话
  const conversationText = turns
    .map((t, i) => `--- 第${i + 1}轮 ---\n用户: ${t.userMessage}\nAI: ${t.aiResponse}`)
    .join('\n\n');

  // 获取已有记忆用于去重
  const existingMemories = await getUserMemories(userId);
  const existingContext = formatExistingMemories(existingMemories);

  const response = await callLLM(
    [
      { role: 'system', content: EXTRACTION_PROMPT },
      {
        role: 'user',
        content: `${existingContext}\n\n请从以下 ${turns.length} 轮对话中提取【新增或变更】的关键信息（已有的信息标记为 skip）：\n\n${conversationText}`,
      },
    ],
    { temperature: 0.2, maxTokens: 1000 }
  );

  const result = parseExtractedJSON(response);
  if (result?.memories?.length > 0) {
    await saveExtractedMemories(userId, stage, result.memories, existingMemories);
    console.log(`[Memory] 批量提取 ${turns.length} 轮对话 → ${result.memories.filter((m: any) => m.action !== 'skip').length} 条新/更新记忆`);
  }
}

/**
 * 格式化已有记忆为上下文（让 LLM 知道哪些信息已经存了）
 */
function formatExistingMemories(memories: Memory[]): string {
  if (memories.length === 0) return '';

  const lines = memories.slice(0, 15).map(m => {
    const contentStr = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content);
    return `- [${m.memory_type}] ${contentStr.substring(0, 100)}`;
  });

  return `【已有记忆（避免重复提取）】\n${lines.join('\n')}`;
}

/**
 * 解析 LLM 返回的 JSON
 */
function parseExtractedJSON(response: string): any {
  try {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                     response.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    return JSON.parse(jsonStr.trim());
  } catch {
    // 尝试直接匹配 JSON 对象
    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* ignore */ }
    }
    console.warn('[Memory] JSON 解析失败');
    return null;
  }
}

/**
 * 保存提取的记忆（含去重和冲突合并）
 */
async function saveExtractedMemories(
  userId: string,
  stage: Stage,
  extractedMemories: any[],
  existingMemories: Memory[]
): Promise<void> {
  const newMemories: Array<{
    userId: string;
    stage: Stage;
    memoryType: MemoryType;
    content: any;
    importance: number;
  }> = [];

  for (const mem of extractedMemories) {
    if (!mem.type || !mem.content) continue;
    if (mem.action === 'skip') continue;

    if (mem.action === 'update') {
      // 冲突合并：找到同类型的旧记忆并更新
      const oldMemory = existingMemories.find(
        m => m.memory_type === mem.type && m.is_active
      );
      if (oldMemory) {
        try {
          await updateMemory(oldMemory.id, {
            content: mem.content,
            importance: mem.importance || oldMemory.importance,
          });
          console.log(`[Memory] 更新记忆: ${mem.type} (id: ${oldMemory.id})`);
        } catch (err) {
          console.warn('[Memory] 更新记忆失败，改为新增:', err);
          newMemories.push({
            userId,
            stage,
            memoryType: mem.type as MemoryType,
            content: mem.content,
            importance: mem.importance || 5,
          });
        }
        continue;
      }
    }

    // 新增记忆（含基本去重：同 type + 完全相同 content 跳过）
    const contentStr = JSON.stringify(mem.content);
    const isDuplicate = existingMemories.some(
      m => m.memory_type === mem.type && JSON.stringify(m.content) === contentStr
    );
    if (isDuplicate) continue;

    newMemories.push({
      userId,
      stage,
      memoryType: mem.type as MemoryType,
      content: mem.content,
      importance: mem.importance || 5,
    });
  }

  if (newMemories.length > 0) {
    await saveMemories(newMemories);
  }
}
