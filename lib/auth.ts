import { cookies } from "next/headers";
import { getDbClient } from "./db";

export interface AuthResult {
  id: string;
  email?: string;
}

/**
 * 从请求中获取当前用户信息
 * 通过检查 session cookie 来验证用户身份
 */
export async function getCurrentUserFromRequest(): Promise<AuthResult | null> {
  try {
    const cookieStore = await cookies();
    
    // 尝试从不同的 cookie 中获取用户信息
    // 方法1: 使用 sb-session-user-id (当前系统使用的)
    const userId = cookieStore.get("sb-session-user-id")?.value;
    const sessionToken = cookieStore.get("sb-access-token")?.value;
    
    if (userId && sessionToken) {
      try {
        // 验证 session token
        const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString());
        
        // 检查是否过期
        if (sessionData.exp && sessionData.exp > Math.floor(Date.now() / 1000)) {
          // 验证 userId 匹配
          if (sessionData.userId === userId) {
            return {
              id: userId,
              email: sessionData.email || undefined,
            };
          }
        }
      } catch (err) {
        console.error("解析 session token 失败:", err);
      }
    }
    
    // 方法2: 尝试使用 app_session_id (如果存在 sessions 表)
    const sessionId = cookieStore.get("app_session_id")?.value;
    if (sessionId) {
      const db = await getDbClient();
      if (db) {
        const { data: session, error } = await db
          .from("sessions")
          .select("user_id, is_active, expires_at")
          .eq("id", sessionId)
          .single();

        if (!error && session) {
          // 检查 session 是否活跃且未过期
          if (session.is_active && new Date(session.expires_at) >= new Date()) {
            // 获取用户信息
            const { data: user, error: userError } = await db
              .from("users")
              .select("id, invite_code")
              .eq("id", session.user_id)
              .single();

            if (!userError && user) {
              // 更新 last_seen_at
              await db
                .from("sessions")
                .update({ last_seen_at: new Date().toISOString() })
                .eq("id", sessionId);

              return {
                id: user.id,
                email: user.invite_code,
              };
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("获取当前用户失败:", error);
    return null;
  }
}

/**
 * 便捷函数：仅返回用户 ID
 */
export async function getCurrentUserId(): Promise<string | null> {
  const auth = await getCurrentUserFromRequest();
  return auth?.id || null;
}
