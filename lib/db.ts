/**
 * 数据库操作封装
 * 支持 Supabase（Vercel 部署兼容）
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// 根据环境变量选择数据库客户端
type DbClient = 
  | { type: 'supabase'; from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any; [key: string]: any };

let dbClient: DbClient | null = null;

// 初始化数据库客户端
export async function getDbClient(): Promise<DbClient | null> {
  if (dbClient) {
    return dbClient;
  }

  // 只使用 Supabase（Vercel 部署：pg 在 Edge Runtime 不可用）
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      // 创建 Supabase 客户端
      const supabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      
      // 包装 SupabaseClient 为符合 DbClient 类型的对象
      // 添加 type: "supabase" 属性以满足自定义类型要求，同时保留所有原生功能（from 方法等）
      dbClient = {
        ...supabaseClient,
        from: supabaseClient.from.bind(supabaseClient),
        rpc: supabaseClient.rpc.bind(supabaseClient),
        type: 'supabase' as const,
      };
      return dbClient;
    } catch (error: any) {
      // 捕获运行时错误，但不中断应用
      console.warn('Failed to initialize Supabase client:', error?.message || error);
    }
  }

  // 如果没有配置数据库，返回 null 而不是抛出错误
  // 这样可以让应用在没有数据库时也能运行（使用 localStorage）
  console.warn('No server database client available. SUPABASE_SERVICE_ROLE_KEY is required.');
  return null;
}

// ==================== 用户相关 ====================
// 注意：本地 users/sessions 表相关逻辑已移除，现在使用 Supabase Auth

// ==================== 消息相关 ====================

/**
 * 保存消息
 */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  stage?: string,
  userId?: string
): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  const insertData: any = {
    session_id: sessionId,
    role,
    content,
    stage: stage || null,
  };

  // 如果提供了 user_id，则添加到插入数据中
  if (userId) {
    insertData.user_id = userId;
  }

  const { error } = await client
    .from('conversation_messages')
    .insert(insertData);

  if (error) throw error;
}

/**
 * 获取会话的所有消息
 */
export async function getMessages(sessionId: string): Promise<Array<{
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stage: string | null;
  created_at: string;
  is_summarized?: boolean;
  summary_id?: string | null;
}>> {
  const client = await getDbClient();
  if (!client) {
    return []; // 数据库不可用，返回空数组
  }

  const { data, error } = await client
    .from('conversation_messages')
    .select('id, role, content, stage, created_at, is_summarized, summary_id')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 根据 user_id 获取所有消息
 */
export async function getMessagesByUserId(userId: string): Promise<Array<{
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stage: string | null;
  created_at: string;
}>> {
  const client = await getDbClient();
  if (!client) {
    return []; // 数据库不可用，返回空数组
  }

  const { data, error } = await client
    .from('conversation_messages')
    .select('id, role, content, stage, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ==================== 白板相关 ====================

/**
 * 保存白板状态
 */
export async function saveWhiteboard(sessionId: string, whiteboard: any, userId?: string): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  const upsertData: any = {
    session_id: sessionId,
    whiteboard,
    updated_at: new Date().toISOString(),
  };

  // 如果提供了 user_id，则添加到数据中
  if (userId) {
    upsertData.user_id = userId;
  }

  // Supabase upsert
  const { error } = await client
    .from('whiteboard_states')
    .upsert(upsertData, {
      onConflict: userId ? 'user_id' : 'session_id',
    });

  if (error) {
    // 如果 upsert 失败，尝试先删除再插入
    if (userId) {
      await client
        .from('whiteboard_states')
        .delete()
        .eq('user_id', userId);
    } else {
      await client
        .from('whiteboard_states')
        .delete()
        .eq('session_id', sessionId);
    }
    
    const { error: insertError } = await client
      .from('whiteboard_states')
      .insert(upsertData);
    
    if (insertError) throw insertError;
  }
}

/**
 * 获取白板状态
 */
export async function getWhiteboard(sessionId: string): Promise<any> {
  const client = await getDbClient();
  if (!client) {
    return {}; // 数据库不可用，返回空对象
  }

  const { data, error } = await client
    .from('whiteboard_states')
    .select('whiteboard')
    .eq('session_id', sessionId)
    .single();

  if (error || !data) return {};
  return data.whiteboard || {};
}

/**
 * 根据 user_id 获取白板状态
 */
export async function getWhiteboardByUserId(userId: string): Promise<any> {
  const client = await getDbClient();
  if (!client) {
    return {}; // 数据库不可用，返回空对象
  }

  const { data, error } = await client
    .from('whiteboard_states')
    .select('whiteboard')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return {};
  return data.whiteboard || {};
}

// ==================== 进度相关 ====================

/**
 * 设置用户当前阶段
 */
export async function setUserStage(userId: string, stage: string): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  // Supabase upsert
  const { error } = await client
    .from('user_progress')
    .upsert({
      user_id: userId,
      current_stage: stage,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    // 如果 upsert 失败，尝试先删除再插入
    await client
      .from('user_progress')
      .delete()
      .eq('user_id', userId);
    
    const { error: insertError } = await client
      .from('user_progress')
      .insert({
        user_id: userId,
        current_stage: stage,
        updated_at: new Date().toISOString(),
      });
    
    if (insertError) throw insertError;
  }
}

/**
 * 获取用户当前阶段
 */
export async function getUserStage(userId: string): Promise<string> {
  const client = await getDbClient();
  if (!client) {
    return 'career_planning'; // 数据库不可用，返回默认阶段
  }

  const { data, error } = await client
    .from('user_progress')
    .select('current_stage')
    .eq('user_id', userId)
    .single();

  if (error || !data) return 'career_planning';
  return data.current_stage || 'career_planning';
}

// ==================== 简历相关 ====================

/**
 * 保存简历解析结果
 */
export async function saveResume(
  userId: string,
  sessionId: string,
  resumeData: {
    rawText: string;
    parsed: any;
  }
): Promise<string> {
  const client = await getDbClient();
  if (!client) {
    // 数据库不可用，生成临时 ID
    return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const resumeId = uuidv4();

  const { error } = await client
    .from('resumes')
    .insert({
      id: resumeId,
      user_id: userId,
      session_id: sessionId,
      raw_text: resumeData.rawText,
      parsed_data: resumeData.parsed,
      created_at: new Date().toISOString(),
    });

  if (error) throw error;

  return resumeId;
}

/**
 * 保存简历上传记录（事务性保存到三个表）
 */
export async function saveResumeUpload(data: {
  userId: string;
  sessionId: string | null;
  filename: string;
  parsed: any;
  rawText: string;
  storageUrl: string | null;
}): Promise<string> {
  const client = await getDbClient();
  if (!client) {
    // 数据库不可用，生成临时 ID
    return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const resumeId = uuidv4();
  const now = new Date().toISOString();

  try {
    // 0. 确保用户记录存在于 users 表中（用于外键约束）
    // 如果用户不存在，创建一个基础记录
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('id', data.userId)
      .single();

    if (!existingUser) {
      // 用户不存在，创建一个基础记录
      const { error: userCreateError } = await client
        .from('users')
        .insert({
          id: data.userId,
          invite_code: `user_${data.userId.substring(0, 8)}`, // 生成一个临时邀请码
          created_at: now,
        });

      if (userCreateError) {
        console.warn('创建用户记录失败（可能已存在）:', userCreateError);
        // 继续执行，因为可能是并发创建导致的冲突
      }
    }

    // 1. 保存到 resumes 表
    const { error: resumesError } = await client
      .from('resumes')
      .insert({
        id: resumeId,
        user_id: data.userId,
        filename: data.filename,
        parsed: data.parsed,
        storage_url: data.storageUrl,
        active: true,
        created_at: now,
        updated_at: now,
      });

    if (resumesError) {
      console.error('保存到 resumes 表失败:', resumesError);
      throw resumesError;
    }

    // 2. 保存到 user_resumes 表
    const { error: userResumesError } = await client
      .from('user_resumes')
      .insert({
        id: uuidv4(),
        user_id: data.userId,
        session_id: data.sessionId,
        original_file_url: data.storageUrl || '', // 使用空字符串代替null
        parsed_text: data.rawText,
        status: 'completed',
        created_at: now,
        updated_at: now,
        parsed_meta: data.parsed,
      });

    if (userResumesError) {
      console.error('保存到 user_resumes 表失败:', userResumesError);
      // 回滚：删除 resumes 表中的记录
      await client.from('resumes').delete().eq('id', resumeId);
      throw userResumesError;
    }

    // 3. 保存到 resume_changes_log 表
    const { error: logError } = await client
      .from('resume_changes_log')
      .insert({
        id: uuidv4(),
        resume_id: resumeId,
        user_id: data.userId,
        session_id: data.sessionId,
        action_type: 'upload',
        action_content: {
          filename: data.filename,
          fileSize: data.rawText.length,
          timestamp: now,
        },
        created_at: now,
      });

    if (logError) {
      console.error('保存到 resume_changes_log 表失败:', logError);
      // 回滚：删除前两个表中的记录
      await client.from('resumes').delete().eq('id', resumeId);
      await client.from('user_resumes').delete().eq('user_id', data.userId).eq('created_at', now);
      throw logError;
    }

    console.log(`成功保存简历到数据库，resumeId: ${resumeId}`);
    return resumeId;
  } catch (error) {
    console.error('保存简历上传记录失败:', error);
    throw error;
  }
}

// ==================== 简历查询 ====================

/**
 * 获取用户最新的简历数据（用于面试个性化出题等跨阶段场景）
 */
export async function getLatestResumeByUserId(userId: string): Promise<{
  id: string;
  parsed: any;
  filename?: string;
  created_at: string;
} | null> {
  const client = await getDbClient();
  if (!client) {
    return null;
  }

  // 先查 resumes 表（简历上传功能写入的表）
  const { data, error } = await client
    .from('resumes')
    .select('id, parsed, filename, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    // 尝试从 user_resumes 表查询
    const { data: data2, error: error2 } = await client
      .from('user_resumes')
      .select('id, parsed_meta, parsed_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error2 || !data2) return null;

    return {
      id: data2.id,
      parsed: data2.parsed_meta || { rawText: data2.parsed_text },
      created_at: data2.created_at,
    };
  }

  return {
    id: data.id,
    parsed: data.parsed,
    filename: data.filename,
    created_at: data.created_at,
  };
}
