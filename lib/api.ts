import { v4 as uuidv4 } from 'uuid';

// 基础配置 [cite: 1]
const BASE_URL = '/api';

// 获取或生成 SessionId [cite: 2]
export const getSessionId = () => {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('sessionId');
  if (!sid) {
    sid = uuidv4();
    localStorage.setItem('sessionId', sid);
  }
  return sid;
};

// 获取 UserId [cite: 2]
export const getUserId = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('userId') || '';
};

// 通用请求封装 
export async function apiPost<T>(path: string, payload: any = {}): Promise<T> {
  const headers = { 'Content-Type': 'application/json' };
  
  // 自动注入 userId 和 sessionId，减少重复代码
  const body = JSON.stringify({
    ...payload,
    userId: getUserId(),    // [cite: 11]
    sessionId: getSessionId() // [cite: 12]
  });

  try {
    const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body });
    const json = await res.json();
    
    // 兼容文档提到的部分接口可能有 ok/data 包装，部分没有的情况
    if (json.ok === false) {
      throw new Error(json.error || json.message || 'Request failed');
    }
    return (json.data || json) as T;
  } catch (error) {
    console.error(`API Error [${path}]:`, error);
    throw error;
  }
}

// 专门处理 GET 请求
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.json();
}