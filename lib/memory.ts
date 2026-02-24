/**
 * 跨阶段AI记忆管理模块
 * 实现记忆的存储、查询、总结等核心功能
 */

import { getDbClient } from './db';

// ==================== 类型定义 ====================

export type Stage = 'career' | 'project' | 'resume' | 'delivery' | 'interview' | 'salary' | 'offer';

export type MemoryType = 
  | 'career_goal'      // 职业目标
  | 'project_detail'   // 项目细节
  | 'skill'            // 技能
  | 'preference'       // 求职偏好
  | 'company_target'   // 目标公司
  | 'salary_expect'    // 薪资期望
  | 'interview_exp'    // 面试经验
  | 'education'        // 教育背景
  | 'work_exp';        // 工作经验

export interface Memory {
  id: string;
  user_id: string;
  stage: Stage;
  memory_type: MemoryType;
  content: any;
  importance: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface MemorySummary {
  id: string;
  user_id: string;
  stage: Stage;
  summary_content: string;
  message_count: number;
  token_count?: number;
  created_at: string;
}

// ==================== 记忆存储 ====================

/**
 * 保存记忆
 */
export async function saveMemory(params: {
  userId: string;
  stage: Stage;
  memoryType: MemoryType;
  content: any;
  importance?: number;
}): Promise<string> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { data, error } = await client
    .from('user_memories')
    .insert({
      user_id: params.userId,
      stage: params.stage,
      memory_type: params.memoryType,
      content: params.content,
      importance: params.importance || 5,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * 批量保存记忆
 */
export async function saveMemories(memories: Array<{
  userId: string;
  stage: Stage;
  memoryType: MemoryType;
  content: any;
  importance?: number;
}>): Promise<void> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { error } = await client
    .from('user_memories')
    .insert(
      memories.map(m => ({
        user_id: m.userId,
        stage: m.stage,
        memory_type: m.memoryType,
        content: m.content,
        importance: m.importance || 5,
      }))
    );

  if (error) throw error;
}

// ==================== 记忆查询 ====================

/**
 * 获取用户的所有活跃记忆
 */
export async function getUserMemories(
  userId: string, 
  stage?: Stage
): Promise<Memory[]> {
  const client = await getDbClient();
  if (!client) return [];

  let query = client
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false });

  if (stage) {
    query = query.eq('stage', stage);
  }

  const { data, error } = await query;
  if (error) {
    console.error('获取用户记忆失败:', error);
    return [];
  }
  return data || [];
}

/**
 * 获取跨阶段的关键记忆（用于上下文注入）
 */
export async function getCrossStageMemories(
  userId: string, 
  currentStage: Stage, 
  limit: number = 10
): Promise<Memory[]> {
  const client = await getDbClient();
  if (!client) return [];

  // 获取其他阶段的高重要性记忆
  const { data, error } = await client
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .neq('stage', currentStage)
    .eq('is_active', true)
    .gte('importance', 7) // 只获取重要性>=7的记忆
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('获取跨阶段记忆失败:', error);
    return [];
  }
  return data || [];
}

/**
 * 按记忆类型获取记忆
 */
export async function getMemoriesByType(
  userId: string,
  memoryType: MemoryType
): Promise<Memory[]> {
  const client = await getDbClient();
  if (!client) return [];

  const { data, error } = await client
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('memory_type', memoryType)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('按类型获取记忆失败:', error);
    return [];
  }
  return data || [];
}

// ==================== 记忆更新 ====================

/**
 * 更新记忆
 */
export async function updateMemory(
  memoryId: string,
  updates: {
    content?: any;
    importance?: number;
    is_active?: boolean;
  }
): Promise<void> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { error } = await client
    .from('user_memories')
    .update(updates)
    .eq('id', memoryId);

  if (error) throw error;
}

/**
 * 停用记忆（软删除）
 */
export async function deactivateMemory(memoryId: string): Promise<void> {
  await updateMemory(memoryId, { is_active: false });
}

/**
 * 停用某个阶段的所有记忆
 */
export async function deactivateStageMemories(
  userId: string,
  stage: Stage
): Promise<void> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { error } = await client
    .from('user_memories')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('stage', stage);

  if (error) throw error;
}

// ==================== 记忆总结 ====================

/**
 * 保存对话总结
 */
export async function saveMemorySummary(params: {
  userId: string;
  stage: Stage;
  summaryContent: string;
  messageCount: number;
  tokenCount?: number;
}): Promise<string> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { data, error } = await client
    .from('memory_summaries')
    .insert({
      user_id: params.userId,
      stage: params.stage,
      summary_content: params.summaryContent,
      message_count: params.messageCount,
      token_count: params.tokenCount,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * 获取最新的总结
 */
export async function getLatestSummary(
  userId: string, 
  stage: Stage
): Promise<MemorySummary | null> {
  const client = await getDbClient();
  if (!client) return null;

  const { data, error } = await client
    .from('memory_summaries')
    .select('*')
    .eq('user_id', userId)
    .eq('stage', stage)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('获取最新总结失败:', error);
    return null;
  }
  return data;
}

/**
 * 获取所有总结
 */
export async function getAllSummaries(
  userId: string,
  stage?: Stage
): Promise<MemorySummary[]> {
  const client = await getDbClient();
  if (!client) return [];

  let query = client
    .from('memory_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (stage) {
    query = query.eq('stage', stage);
  }

  const { data, error } = await query;
  if (error) {
    console.error('获取所有总结失败:', error);
    return [];
  }
  return data || [];
}

// ==================== 消息标记 ====================

/**
 * 标记消息为已总结
 */
export async function markMessagesAsSummarized(
  messageIds: string[], 
  summaryId: string
): Promise<void> {
  const client = await getDbClient();
  if (!client) throw new Error('Database not available');

  const { error } = await client
    .from('conversation_messages')
    .update({
      is_summarized: true,
      summary_id: summaryId,
    })
    .in('id', messageIds);

  if (error) throw error;
}

/**
 * 获取未总结的消息数量
 */
export async function getUnsummarizedMessageCount(
  userId: string, 
  stage: Stage
): Promise<number> {
  const client = await getDbClient();
  if (!client) return 0;

  const { count, error } = await client
    .from('conversation_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('stage', stage)
    .eq('is_summarized', false);

  if (error) {
    console.error('获取未总结消息数量失败:', error);
    return 0;
  }
  return count || 0;
}

/**
 * 获取未总结的消息
 */
export async function getUnsummarizedMessages(
  userId: string,
  stage: Stage,
  limit?: number
): Promise<Array<{
  id: string;
  role: string;
  content: string;
  created_at: string;
}>> {
  const client = await getDbClient();
  if (!client) return [];

  let query = client
    .from('conversation_messages')
    .select('id, role, content, created_at')
    .eq('user_id', userId)
    .eq('stage', stage)
    .eq('is_summarized', false)
    .order('created_at', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('获取未总结消息失败:', error);
    return [];
  }
  return data || [];
}

// ==================== 辅助函数 ====================

/**
 * 格式化记忆为文本（用于上下文注入）
 */
export function formatMemoriesForContext(memories: Memory[]): string {
  if (memories.length === 0) return '';

  const grouped = memories.reduce((acc, memory) => {
    const type = memory.memory_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(memory);
    return acc;
  }, {} as Record<string, Memory[]>);

  const typeLabels: Record<string, string> = {
    career_goal: '职业目标',
    project_detail: '项目经历',
    skill: '技能优势',
    preference: '求职偏好',
    company_target: '目标公司',
    salary_expect: '薪资期望',
    interview_exp: '面试经验',
    education: '教育背景',
    work_exp: '工作经验',
  };

  let result = '\n【用户背景信息】\n';
  
  for (const [type, mems] of Object.entries(grouped)) {
    const label = typeLabels[type] || type;
    result += `\n${label}：\n`;
    mems.forEach(mem => {
      const contentStr = typeof mem.content === 'string' 
        ? mem.content 
        : JSON.stringify(mem.content, null, 2);
      result += `- ${contentStr}\n`;
    });
  }

  return result;
}

/**
 * 检查是否需要触发总结
 */
export async function shouldTriggerSummarization(
  userId: string,
  stage: Stage,
  threshold: number = 20
): Promise<boolean> {
  const count = await getUnsummarizedMessageCount(userId, stage);
  return count >= threshold;
}
