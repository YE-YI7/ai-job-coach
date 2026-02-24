"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 客户端认证检查 Hook
 * 作为 middleware 的兜底检查，确保客户端也会跳转到登录页
 */
export function useAuth() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      // 检查 cookie（httpOnly: false 的 cookie 可被客户端读取）
      const cookies = document.cookie.split(';');
      const hasSessionCookie = cookies.some(cookie => 
        cookie.trim().startsWith('sb-access-token=') || 
        cookie.trim().startsWith('sb-session-user-id=')
      );

      // 检查 localStorage（向后兼容旧登录方式）
      const sessionId = localStorage.getItem("sessionId");

      // 只要有任一认证标识即视为已登录
      if (!hasSessionCookie && !sessionId) {
        router.push("/login");
        return false;
      }

      return true;
    };

    if (!checkAuth()) {
      return;
    }

    const interval = setInterval(() => {
      if (!checkAuth()) {
        clearInterval(interval);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);
}












