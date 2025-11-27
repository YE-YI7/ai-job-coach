/**
 * 邀请码生成工具
 * 生成唯一、易读的邀请码作为用户ID
 */

/**
 * 生成邀请码
 * 格式：6位大写字母+数字组合，例如：A1B2C3
 * @param length 邀请码长度，默认6位
 * @returns 邀请码字符串
 */
export function generateInviteCode(length: number = 6): string {
  // 使用大写字母和数字，排除容易混淆的字符（0, O, I, 1）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * 验证邀请码格式
 * @param code 邀请码
 * @returns 是否为有效格式
 */
export function isValidInviteCode(code: string): boolean {
  // 6-20位，只包含大写字母和数字
  return /^[A-Z0-9]{6,20}$/.test(code);
}

/**
 * 检查邀请码是否已存在（需要在数据库查询）
 * @param code 邀请码
 * @param checkExists 检查函数，返回 Promise<boolean>
 * @returns 是否可用（不存在）
 */
export async function isInviteCodeAvailable(
  code: string,
  checkExists: (code: string) => Promise<boolean>
): Promise<boolean> {
  if (!isValidInviteCode(code)) {
    return false;
  }
  
  const exists = await checkExists(code);
  return !exists;
}

/**
 * 生成唯一的邀请码（自动检查重复）
 * @param checkExists 检查函数，返回 Promise<boolean>
 * @param maxAttempts 最大尝试次数，默认10次
 * @param length 邀请码长度，默认6位
 * @returns 唯一的邀请码
 */
export async function generateUniqueInviteCode(
  checkExists: (code: string) => Promise<boolean>,
  maxAttempts: number = 10,
  length: number = 6
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateInviteCode(length);
    const available = await isInviteCodeAvailable(code, checkExists);
    
    if (available) {
      return code;
    }
  }
  
  // 如果多次尝试都重复，增加长度再试
  if (length < 10) {
    return generateUniqueInviteCode(checkExists, maxAttempts, length + 1);
  }
  
  throw new Error('无法生成唯一的邀请码，请稍后重试');
}




