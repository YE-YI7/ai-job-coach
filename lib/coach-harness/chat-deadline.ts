/** Leave time for persistence/refund before the route's 120s hard cutoff. */
export function chatAttemptBudget(elapsedMs:number,automatic:boolean,attempt:number){
  const remaining=110_000-Math.max(0,elapsedMs);
  const fallbackReserve=automatic&&attempt===1?18_000:0;
  const timeoutMs=Math.min(60_000,remaining-fallbackReserve);
  if(timeoutMs<3000)throw Error("LLM_REQUEST_TIMEOUT");
  return {timeoutMs,firstTokenTimeoutMs:Math.min(timeoutMs,automatic?12_000:25_000)};
}
