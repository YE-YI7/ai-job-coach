// SMS 验证码缓存工具函数
// 从 route.ts 中分离出来，以符合 Next.js App Router 的导出规则

const smsCache = new Map<string, { code: string; expiresAt: number }>();
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * 获取缓存的验证码
 * @param phone 手机号
 * @returns 验证码字符串，如果不存在或已过期则返回 null
 */
export function getCachedCode(phone: string): string | null {
  const record = smsCache.get(phone);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    smsCache.delete(phone);
    return null;
  }
  return record.code;
}

/**
 * 清除缓存的验证码
 * @param phone 手机号
 */
export function clearCachedCode(phone: string): void {
  smsCache.delete(phone);
}

/**
 * 设置验证码到缓存
 * @param phone 手机号
 * @param code 验证码
 */
export function setCachedCode(phone: string, code: string): void {
  smsCache.set(phone, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
}

