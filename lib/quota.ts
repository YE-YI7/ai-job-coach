/**
 * 额度管理系统
 */

import { getDbClient } from './db';

export interface UserQuota {
  free_chat_daily: number;
  free_resume_daily: number;
  paid_chat_remaining: number;
  paid_resume_remaining: number;
  paid_interview_remaining: number;
  last_free_reset: string;
}

export interface QuotaReservation {
  id: string;
  source: string;
  remaining: number | null;
}

export type QuotaType = 'chat' | 'resume' | 'interview';

export async function reserveQuota(
  userId: string,
  type: QuotaType,
  idempotencyKey: string
): Promise<QuotaReservation | null> {
  const client = await getDbClient();
  if (!client) return { id: `offline-${idempotencyKey}`, source: 'offline', remaining: null };
  const { data, error } = await client.rpc('reserve_user_quota', {
    p_user_id: userId,
    p_quota_type: type,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed || !row.reservation_id) return null;
  return { id: String(row.reservation_id), source: String(row.source_field || 'unknown'), remaining: row.remaining == null ? null : Number(row.remaining) };
}

export async function finalizeQuota(reservation: QuotaReservation | null, success: boolean) {
  if (!reservation || reservation.id.startsWith('offline-')) return true;
  const client = await getDbClient();
  if (!client) return false;
  const { data, error } = await client.rpc('finalize_user_quota', {
    p_reservation_id: reservation.id,
    p_success: success,
  });
  if (error) throw error;
  return Boolean(data);
}

const DEFAULT_FREE_CHAT = 3;
const DEFAULT_FREE_RESUME = 1;

/**
 * 获取或创建用户额度（惰性创建）
 */
export async function getOrCreateQuota(userId: string): Promise<UserQuota> {
  const client = await getDbClient();
  if (!client) {
    return {
      free_chat_daily: DEFAULT_FREE_CHAT,
      free_resume_daily: DEFAULT_FREE_RESUME,
      paid_chat_remaining: 0,
      paid_resume_remaining: 0,
      paid_interview_remaining: 0,
      last_free_reset: new Date().toISOString().split('T')[0],
    };
  }

  // 查询现有额度
  const { data, error } = await client
    .from('user_quotas')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!error && data) {
    // 检查是否需要重置每日免费额度
    const today = new Date().toISOString().split('T')[0];
    if (data.last_free_reset !== today) {
      const { data: updated } = await client
        .from('user_quotas')
        .update({
          free_chat_daily: DEFAULT_FREE_CHAT,
          free_resume_daily: DEFAULT_FREE_RESUME,
          last_free_reset: today,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();

      return updated || data;
    }
    return data;
  }

  // 创建新记录
  const today = new Date().toISOString().split('T')[0];
  const newQuota = {
    user_id: userId,
    free_chat_daily: DEFAULT_FREE_CHAT,
    free_resume_daily: DEFAULT_FREE_RESUME,
    paid_chat_remaining: 0,
    paid_resume_remaining: 0,
    paid_interview_remaining: 0,
    last_free_reset: today,
  };

  const { data: created } = await client
    .from('user_quotas')
    .insert(newQuota)
    .select()
    .single();

  return created || { ...newQuota, last_free_reset: today };
}

/**
 * 检查额度是否充足
 */
export async function checkQuota(
  userId: string,
  type: 'chat' | 'resume' | 'interview'
): Promise<{ allowed: boolean; remaining: number; source: 'free' | 'paid' }> {
  const quota = await getOrCreateQuota(userId);

  if (type === 'chat') {
    if (quota.free_chat_daily > 0) {
      return { allowed: true, remaining: quota.free_chat_daily, source: 'free' };
    }
    if (quota.paid_chat_remaining > 0) {
      return { allowed: true, remaining: quota.paid_chat_remaining, source: 'paid' };
    }
    return { allowed: false, remaining: 0, source: 'free' };
  }

  if (type === 'resume') {
    if (quota.free_resume_daily > 0) {
      return { allowed: true, remaining: quota.free_resume_daily, source: 'free' };
    }
    if (quota.paid_resume_remaining > 0) {
      return { allowed: true, remaining: quota.paid_resume_remaining, source: 'paid' };
    }
    return { allowed: false, remaining: 0, source: 'free' };
  }

  if (type === 'interview') {
    if (quota.paid_interview_remaining > 0) {
      return { allowed: true, remaining: quota.paid_interview_remaining, source: 'paid' };
    }
    // 面试也使用免费聊天额度
    if (quota.free_chat_daily > 0) {
      return { allowed: true, remaining: quota.free_chat_daily, source: 'free' };
    }
    return { allowed: false, remaining: 0, source: 'free' };
  }

  return { allowed: false, remaining: 0, source: 'free' };
}

/**
 * 消费一次额度（使用条件更新避免竞态条件）
 */
export async function consumeQuota(
  userId: string,
  type: 'chat' | 'resume' | 'interview'
): Promise<boolean> {
  const client = await getDbClient();
  if (!client) return true; // 数据库不可用时放行

  const quota = await getOrCreateQuota(userId);

  // 根据类型和优先级确定要扣减的字段和条件
  let field: string;
  let currentValue: number;

  if (type === 'chat') {
    if (quota.free_chat_daily > 0) {
      field = 'free_chat_daily';
      currentValue = quota.free_chat_daily;
    } else if (quota.paid_chat_remaining > 0) {
      field = 'paid_chat_remaining';
      currentValue = quota.paid_chat_remaining;
    } else {
      return false;
    }
  } else if (type === 'resume') {
    if (quota.free_resume_daily > 0) {
      field = 'free_resume_daily';
      currentValue = quota.free_resume_daily;
    } else if (quota.paid_resume_remaining > 0) {
      field = 'paid_resume_remaining';
      currentValue = quota.paid_resume_remaining;
    } else {
      return false;
    }
  } else if (type === 'interview') {
    if (quota.paid_interview_remaining > 0) {
      field = 'paid_interview_remaining';
      currentValue = quota.paid_interview_remaining;
    } else if (quota.free_chat_daily > 0) {
      field = 'free_chat_daily';
      currentValue = quota.free_chat_daily;
    } else {
      return false;
    }
  } else {
    return false;
  }

  // 使用条件更新：只有当字段值 >= 1 时才扣减，防止并发扣成负数
  const { data, error } = await client
    .from('user_quotas')
    .update({
      [field]: currentValue - 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .gte(field, 1)
    .select()
    .single();

  return !error && !!data;
}
