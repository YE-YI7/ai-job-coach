export type WatchaOAuthStage = 'token' | 'userinfo' | 'refresh';
type Failure = 'timeout' | 'unavailable' | 'invalid_response' | 'rejected';
export const WATCHA_OAUTH_TIMEOUT_MS = 8_000;

export class WatchaOAuthRequestError extends Error {
  constructor(readonly stage: WatchaOAuthStage, readonly reason: Failure) {
    super(reason === 'timeout'
      ? '观猹登录服务响应超时，请重新发起登录。已有账号和资料未改变。'
      : reason === 'rejected'
        ? '观猹授权未完成或已失效，请重新发起登录。'
        : '暂时无法连接观猹登录服务，请稍后重试。已有资料仍保留。');
    this.name = 'WatchaOAuthRequestError';
  }
}

/** A one-time authorization code must never be retried automatically. */
export async function watchaOAuthJson(
  stage: WatchaOAuthStage, url: string, init: RequestInit,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WatchaOAuthRequestError(stage, 'timeout'));
    }, WATCHA_OAUTH_TIMEOUT_MS);
  });
  const request = async () => {
    const response = await fetch(url, {...init, cache:'no-store', redirect:'error', signal:controller.signal});
    if (!response.ok) throw new WatchaOAuthRequestError(stage, response.status === 400 || response.status === 401 ? 'rejected' : 'unavailable');
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new WatchaOAuthRequestError(stage, 'invalid_response'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new WatchaOAuthRequestError(stage, 'invalid_response');
    }
    return data as Record<string, unknown>;
  };
  try {
    const result = await Promise.race([request(), deadline]);
    console.info('[WATCHA OAuth] upstream', {stage, elapsedMs:Date.now()-started, outcome:'received'});
    return result;
  } catch (error) {
    const failure = error instanceof WatchaOAuthRequestError ? error
      : new WatchaOAuthRequestError(stage, controller.signal.aborted ? 'timeout' : 'unavailable');
    // Never log a request URL, credentials, upstream body or raw network error.
    console.warn('[WATCHA OAuth] upstream', {stage, elapsedMs:Date.now()-started, outcome:failure.reason});
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}
