/**
 * 面试复盘 - 数据库操作层
 */
import { getDbClient } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type {
  ReviewSession,
  ParsedQuestion,
  QuestionAnalysisResult,
  ReviewSummary,
  ReviewRoleId,
  FollowUpQuestion,
  TrainingTask,
  TaskStatus,
} from "./types";

// ===== Session CRUD =====

/** 创建复盘会话（草稿状态） */
export async function createReviewSession(data: {
  userId: string;
  company: string;
  round: string;
  interviewTime: string;
  tags: string[];
  resumeSnapshot?: string;
}): Promise<string | null> {
  const client = await getDbClient();
  if (!client) return null;

  const id = uuidv4();
  const { error } = await client.from("interview_review_sessions").insert({
    id,
    user_id: data.userId,
    company: data.company,
    round: data.round,
    interview_time: data.interviewTime || null,
    tags: data.tags,
    resume_snapshot: data.resumeSnapshot || null,
    status: "draft",
  });

  if (error) {
    console.error("创建复盘会话失败:", error);
    throw error;
  }
  return id;
}

/** 保存解析结果 */
export async function saveParseResult(
  sessionId: string,
  rawContent: string,
  parsedQuestions: ParsedQuestion[]
): Promise<void> {
  const client = await getDbClient();
  if (!client) return;

  const { error } = await client
    .from("interview_review_sessions")
    .update({
      raw_content: rawContent,
      parsed_questions: parsedQuestions,
      status: "parsed",
    })
    .eq("id", sessionId);

  if (error) {
    console.error("保存解析结果失败:", error);
    throw error;
  }
}

/** 保存分析结果 */
export async function saveAnalysisResult(
  sessionId: string,
  analysisResults: QuestionAnalysisResult[],
  summary: ReviewSummary | null,
  rolesUsed: Array<{ id: ReviewRoleId; name: string; tag: string }>
): Promise<void> {
  const client = await getDbClient();
  if (!client) return;

  const { error } = await client
    .from("interview_review_sessions")
    .update({
      analysis_results: analysisResults,
      summary,
      roles_used: rolesUsed,
      status: "analyzed",
    })
    .eq("id", sessionId);

  if (error) {
    console.error("保存分析结果失败:", error);
    throw error;
  }
}

/** 更新会话标签 */
export async function updateSessionTags(
  sessionId: string,
  userId: string,
  tags: string[]
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_sessions")
    .update({ tags })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) {
    console.error("更新标签失败:", error);
    return false;
  }
  return true;
}

/** 更新会话简历快照 */
export async function updateSessionResume(
  sessionId: string,
  userId: string,
  resumeSnapshot: string | null
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_sessions")
    .update({ resume_snapshot: resumeSnapshot })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) {
    console.error("更新简历关联失败:", error);
    return false;
  }
  return true;
}

/** 获取用户所有历史标签（去重） */
export async function getUserTags(userId: string): Promise<string[]> {
  const client = await getDbClient();
  if (!client) return [];

  const { data, error } = await client
    .from("interview_review_sessions")
    .select("tags")
    .eq("user_id", userId)
    .not("tags", "eq", "{}");

  if (error || !data) return [];

  const tagSet = new Set<string>();
  for (const row of data) {
    if (Array.isArray(row.tags)) {
      row.tags.forEach((t: string) => tagSet.add(t));
    }
  }
  return Array.from(tagSet).sort();
}

/** 获取单场复盘详情 */
export async function getReviewSession(
  sessionId: string,
  userId: string
): Promise<ReviewSession | null> {
  const client = await getDbClient();
  if (!client) return null;

  const { data, error } = await client
    .from("interview_review_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return mapDbRowToSession(data);
}

/** 获取历史列表（分页 + 筛选 + 排序） */
export async function getReviewHistory(params: {
  userId: string;
  company?: string;
  round?: string;
  tag?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  sort?: "recent" | "grade";
  page?: number;
  pageSize?: number;
}): Promise<{ sessions: ReviewSession[]; total: number }> {
  const client = await getDbClient();
  if (!client) return { sessions: [], total: 0 };

  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 50);
  const offset = (page - 1) * pageSize;

  // 构建查询
  let query = client
    .from("interview_review_sessions")
    .select("*", { count: "exact" })
    .eq("user_id", params.userId)
    .range(offset, offset + pageSize - 1);

  // 排序
  if (params.sort === "grade") {
    // 按评级排序：summary->>'overall_grade' 降序，再按时间降序
    query = query.order("created_at", { ascending: false });
  } else {
    // 默认：最近优先
    query = query.order("created_at", { ascending: false });
  }

  // 筛选条件
  if (params.company) {
    query = query.ilike("company", `%${params.company}%`);
  }
  if (params.round) {
    query = query.ilike("round", `%${params.round}%`);
  }
  if (params.tag) {
    query = query.contains("tags", [params.tag]);
  }
  if (params.startDate) {
    query = query.gte("interview_time", params.startDate);
  }
  if (params.endDate) {
    query = query.lte("interview_time", params.endDate);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("获取复盘历史失败:", error);
    return { sessions: [], total: 0 };
  }

  return {
    sessions: (data || []).map(mapDbRowToSession),
    total: count || 0,
  };
}

/** 删除单场复盘 */
export async function deleteReviewSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) {
    console.error("删除复盘会话失败:", error);
    return false;
  }
  return true;
}

/** 清空用户所有复盘历史 */
export async function deleteAllReviewSessions(userId: string): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("清空复盘历史失败:", error);
    return false;
  }
  return true;
}

// ===== Followup 操作 =====

/** 保存追问记录 */
export async function saveFollowups(
  sessionId: string,
  questionIndex: number,
  followups: FollowUpQuestion[]
): Promise<void> {
  const client = await getDbClient();
  if (!client) return;

  const { error } = await client
    .from("interview_review_followups")
    .upsert(
      {
        session_id: sessionId,
        question_index: questionIndex,
        followups,
      },
      { onConflict: "session_id,question_index" }
    );

  if (error) {
    console.error("保存追问记录失败:", error);
  }
}

/** 获取某场复盘的所有追问记录 */
export async function getFollowups(
  sessionId: string
): Promise<Record<number, FollowUpQuestion[]>> {
  const client = await getDbClient();
  if (!client) return {};

  const { data, error } = await client
    .from("interview_review_followups")
    .select("question_index, followups")
    .eq("session_id", sessionId);

  if (error || !data) return {};

  const result: Record<number, FollowUpQuestion[]> = {};
  for (const row of data) {
    result[row.question_index] = row.followups;
  }
  return result;
}

// ===== Training Tasks 操作 =====

/** 批量创建训练任务 */
export async function createTrainingTasks(
  userId: string,
  tasks: Array<{
    sessionId: string | null;
    questionIndex: number | null;
    title: string;
    description: string;
    taskType: string;
    source: string;
    context?: Record<string, any>;
  }>
): Promise<TrainingTask[]> {
  const client = await getDbClient();
  if (!client) return [];

  const rows = tasks.map(t => ({
    id: uuidv4(),
    user_id: userId,
    session_id: t.sessionId,
    question_index: t.questionIndex,
    title: t.title,
    description: t.description,
    task_type: t.taskType,
    source: t.source,
    context: t.context || {},
    status: "pending",
  }));

  const { data, error } = await client
    .from("interview_review_tasks")
    .insert(rows)
    .select("*");

  if (error) {
    console.error("创建训练任务失败:", error);
    return [];
  }

  return (data || []).map(mapDbRowToTask);
}

/** 获取用户的训练任务列表 */
export async function getTrainingTasks(params: {
  userId: string;
  sessionId?: string;
  questionIndex?: number;
  status?: TaskStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ tasks: TrainingTask[]; total: number }> {
  const client = await getDbClient();
  if (!client) return { tasks: [], total: 0 };

  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 50, 100);
  const offset = (page - 1) * pageSize;

  let query = client
    .from("interview_review_tasks")
    .select("*", { count: "exact" })
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.sessionId) {
    query = query.eq("session_id", params.sessionId);
  }
  if (params.questionIndex !== undefined) {
    query = query.eq("question_index", params.questionIndex);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("获取训练任务失败:", error);
    return { tasks: [], total: 0 };
  }

  return {
    tasks: (data || []).map(mapDbRowToTask),
    total: count || 0,
  };
}

/** 更新任务状态 */
export async function updateTaskStatus(
  taskId: string,
  userId: string,
  status: TaskStatus
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const updateData: Record<string, any> = { status };
  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  } else {
    updateData.completed_at = null;
  }

  const { error } = await client
    .from("interview_review_tasks")
    .update(updateData)
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) {
    console.error("更新任务状态失败:", error);
    return false;
  }
  return true;
}

/** 删除训练任务 */
export async function deleteTrainingTask(
  taskId: string,
  userId: string
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) {
    console.error("删除训练任务失败:", error);
    return false;
  }
  return true;
}

/** 获取用户待完成任务数 */
export async function getPendingTaskCount(userId: string): Promise<number> {
  const client = await getDbClient();
  if (!client) return 0;

  const { count, error } = await client
    .from("interview_review_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) return 0;
  return count || 0;
}

function mapDbRowToTask(row: any): TrainingTask {
  return {
    id: row.id,
    user_id: row.user_id,
    session_id: row.session_id,
    question_index: row.question_index,
    title: row.title,
    description: row.description || "",
    task_type: row.task_type,
    source: row.source,
    status: row.status,
    completed_at: row.completed_at,
    context: row.context || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===== 工具函数 =====

/** 手动删除某场复盘的原始文本 */
export async function deleteRawContent(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return false;

  const { error } = await client
    .from("interview_review_sessions")
    .update({ raw_content: null, raw_content_expires_at: null })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) {
    console.error("删除原始文本失败:", error);
    return false;
  }
  return true;
}

/** 清理所有过期的原始文本（可定期调用） */
export async function cleanupExpiredRawContent(): Promise<number> {
  const client = await getDbClient();
  if (!client) return 0;

  const { data, error } = await client.rpc("cleanup_expired_raw_content");

  if (error) {
    console.error("清理过期原始文本失败:", error);
    return 0;
  }
  return data || 0;
}

function mapDbRowToSession(row: any): ReviewSession {
  return {
    id: row.id,
    user_id: row.user_id,
    company: row.company || "",
    round: row.round || "",
    interview_time: row.interview_time || "",
    tags: row.tags || [],
    resume_snapshot: row.resume_snapshot || undefined,
    raw_content: row.raw_content || "",
    parsed_questions: row.parsed_questions || [],
    analysis_results: row.analysis_results || [],
    summary: row.summary || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
