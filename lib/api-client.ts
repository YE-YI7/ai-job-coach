/**
 * API 客户端封装
 * 处理 401 错误，自动跳转到登录页
 */

/**
 * 封装的 fetch 函数
 * 如果返回 401，自动跳转到登录页并显示提示
 */
export async function apiFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: "include", // 确保发送 cookie
  });

  // 处理 401 未认证错误
  if (response.status === 401) {
    // 清除可能的本地存储
    if (typeof window !== "undefined") {
      // 显示提示
      alert("当前账号已在其他设备登录，你已被登出");
      
      // 跳转到登录页
      window.location.href = "/login";
    }
    
    // 返回响应，让调用者可以处理
    return response;
  }

  return response;
}

/**
 * 封装的 fetch JSON 函数
 * 自动解析 JSON 并处理 401
 */
export async function apiFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await apiFetch(url, options);
  
  if (!response.ok) {
    // 如果不是 401（401 已经在 apiFetch 中处理了），抛出错误
    if (response.status !== 401) {
      const error = await response.json().catch(() => ({ error: "未知错误" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }
  
  return response.json();
}









