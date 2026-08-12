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
    const checkAuth = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        router.push("/login");
        return false;
      }
      return true;
    };

    void checkAuth();

    const interval = setInterval(() => {
      void checkAuth().then((valid) => { if (!valid) clearInterval(interval); });
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);
}











