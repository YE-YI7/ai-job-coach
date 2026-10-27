import {createHash} from 'node:crypto';

export function isolatedEvalRepairId(parentId: string) {
  const s = createHash('sha256').update(`isolated-eval-repair:v1:${parentId}`).digest('hex');
  return `${s.slice(0,8)}-${s.slice(8,12)}-5${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;
}

/** One durable continuation, not another fresh workflow or billing bypass.
 * Caller must already be the authenticated administrator owning the parent. */
export function readIsolatedEvalRepair(parent: Record<string,unknown>, body: Record<string,unknown>) {
  const input=parent.input as Record<string,unknown>|undefined;
  const comparison=parent.comparison as Record<string,unknown>|undefined;
  const result=parent.result as {output?:unknown;rawResponse?:{ok?:boolean}}|undefined;
  const spans=Array.isArray(parent.spans)?parent.spans as Array<Record<string,unknown>>:[];
  const agents=spans.filter(s=>s.kind==='agent');
  const maxCalls=Number(comparison?.callLimit)-agents.length;
  if(parent.isolation!=='no_opportunity_no_quota_no_old_answers' || parent.repairOf
    || !['completed','partial'].includes(String(parent.status))
    || !input || input.resume!==body.resumeText || input.jobDescription!==String(body.jobDescription||'')
    || input.editingRequest!==body.editingRequest || !comparison
    || comparison.model!=='deepseek-v4-flash' || agents.length<1 || !Number.isInteger(maxCalls)
    || maxCalls<2 || maxCalls>3 || !agents.every(s=>s.model===comparison.model)
    || (body.comparison as Record<string,unknown>)?.model!==comparison.model
    || (body.comparison as Record<string,unknown>)?.callLimit!==maxCalls
    || body.requestId!==isolatedEvalRepairId(String(body.repairOf))
    || result?.rawResponse?.ok!==true || typeof result.output!=='string' || result.output.length>30000
    || typeof body.repairFeedback!=='string' || body.repairFeedback.trim().length<10 || body.repairFeedback.length>3000
    || body.selfEvaluate===true)
    throw Error('EVAL_REPAIR_CONTRACT_INVALID');
  return {maxCalls, previousCandidate:result.output, feedback:[body.repairFeedback], parentCalls:agents.length};
}
