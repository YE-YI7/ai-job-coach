import type { QuotaPool } from "./quota-label";

/** Free persistence must precede this check. This does not reserve or spend credit. */
export async function assertGenerationQuota(type: QuotaPool, fetcher: typeof fetch = fetch, options: {sessionId?:string; answerSaved?:boolean} = {}) {
  const prefix = options.answerSaved === false ? "" : "回答已保存，";
  const url = options.sessionId ? `/api/quota/check?sessionId=${encodeURIComponent(options.sessionId)}` : "/api/quota/check";
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  if (!response.ok || body.ok !== true || !body.checks?.[type]) {
    throw new Error(`${prefix}暂时无法确认额度，请稍后重试。`);
  }
  if (!body.checks[type].allowed) {
    throw new Error(`${prefix}当前额度不足。${options.answerSaved === false ? "补充额度后可开始，不会扣费。" : "补充额度后可从这条回答继续，不必重填。"}`);
  }
}
