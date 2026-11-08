/**
 * 观猹（Watcha）OAuth2 接入工具
 * 标准 OAuth2 Authorization Code 模式（机密客户端）
 * 
 * 文档参考：观猹 OAuth2 接入文档
 * - 授权端点：https://watcha.cn/oauth/authorize
 * - Token 端点：https://watcha.cn/oauth/api/token
 * - 用户信息：https://watcha.cn/oauth/api/userinfo
 */

import { getWatchaOAuthConfig } from "./watcha-oauth-config";
import {watchaOAuthJson, WatchaOAuthRequestError} from './watcha-oauth-request';

const WATCHA_BASE_URL = "https://watcha.cn";

/**
 * 生成授权 URL
 */
export function getWatchaAuthorizeUrl(state: string, baseUrl?: string): string {
  const { clientId, redirectUri } = getWatchaOAuthConfig(baseUrl);

  // 手动拼接 URL
  // 重要：client_id 中可能含 +/= 等特殊字符，必须 encodeURIComponent（观猹文档明确要求）
  const queryString = [
    `response_type=code`,
    `client_id=${encodeURIComponent(clientId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=read`,
    `state=${encodeURIComponent(state)}`,
  ].join("&");

  return `${WATCHA_BASE_URL}/oauth/authorize?${queryString}`;
}

/**
 * 用授权码换取 Token
 */
export async function exchangeCodeForToken(code: string, baseUrl?: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const { clientId, clientSecret, redirectUri } = getWatchaOAuthConfig(baseUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const data = await watchaOAuthJson('token', `${WATCHA_BASE_URL}/oauth/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (data.error) throw new WatchaOAuthRequestError('token', 'rejected');
  if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new WatchaOAuthRequestError('token', 'invalid_response');
  }
  return data as {access_token:string;token_type:string;expires_in:number;refresh_token:string;scope:string};
}

/**
 * 获取授权用户信息
 */
export async function getWatchaUserInfo(accessToken: string): Promise<{
  user_id: number;
  nickname: string;
  avatar_url?: string;
}> {
  const data = await watchaOAuthJson('userinfo',
    `${WATCHA_BASE_URL}/oauth/api/userinfo?access_token=${encodeURIComponent(accessToken)}`,
    { method: "GET" }
  );

  const user = data.data as {user_id:number;nickname:string;avatar_url?:string} | undefined;
  if (data.statusCode !== 200 || !user || !Number.isSafeInteger(user.user_id) || user.user_id <= 0) {
    throw new WatchaOAuthRequestError('userinfo', 'invalid_response');
  }

  return user;
}

/**
 * 刷新 Access Token
 */
export async function refreshWatchaToken(refreshToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const data = await watchaOAuthJson('refresh', `${WATCHA_BASE_URL}/oauth/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (data.error) throw new WatchaOAuthRequestError('refresh', 'rejected');
  if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new WatchaOAuthRequestError('refresh', 'invalid_response');
  }
  return data as {access_token:string;token_type:string;expires_in:number;refresh_token:string;scope:string};
}

/**
 * 生成随机 state（防 CSRF）
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
