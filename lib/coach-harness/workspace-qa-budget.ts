/** Explicitly configured synthetic-account observation only. Never supplies
 * model messages, changes a model, grants quota or selects an Agent tool. */
import {getDbClient} from '@/lib/db';
import {hostedStepModel} from '@/lib/hosted-model';
import type {EvalSpan} from './eval-scope';

type Entry = {id:string; reservedCny:number; settledUpperCny?:number; inputTokens?:number; outputTokens?:number};
type Budget = {
  source:'clean-first-use-budget-v1'; approved:true; synthetic:true;
  opportunityId:string; authorizationId:string; expiresAt:string; closedAt?:string;
  capCny:number; capCalls:number; callVersion:number; calls:Entry[]; evalRunId?:string;
};
const spent = (budget:Budget) => budget.calls.reduce((sum,call)=>sum+(call.settledUpperCny??call.reservedCny),0);
export function workspaceQaTarget(userId:string) {
  return Boolean(process.env.F6_QA_USER_ID && process.env.F6_QA_USER_ID === userId);
}
export async function workspaceQaBudget(userId:string, opportunityId:unknown, evalRunId:string) {
  if (!workspaceQaTarget(userId)) return undefined;
  const id=process.env.F6_QA_BUDGET_ID, db=await getDbClient();
  if (!id || !db || typeof opportunityId!=='string' || !opportunityId) throw Error('QA_BUDGET_NOT_CONFIGURED');
  async function read():Promise<Budget> {
    const row=await db!.from('coach_eval_runs').select('run').eq('id',id!).eq('user_id',userId).single();
    const run=row.data?.run as Budget;
    if (row.error || !run || run.source!=='clean-first-use-budget-v1' || !run.approved || !run.synthetic
      || run.opportunityId!==opportunityId || !run.authorizationId || run.closedAt
      || Date.parse(run.expiresAt)<=Date.now() || !Number.isFinite(Date.parse(run.expiresAt))
      || run.capCny!==0.50 || run.capCalls!==27 || !Array.isArray(run.calls)
      || !Number.isSafeInteger(run.callVersion) || (run.evalRunId && run.evalRunId!==evalRunId)) {
      throw Error('QA_BUDGET_INVALID_OR_EXPIRED');
    }
    return run;
  }
  async function write(previous:Budget,next:Budget) {
    const saved=await db!.from('coach_eval_runs').update({run:next,status:'running',updated_at:new Date().toISOString()})
      .eq('id',id!).eq('user_id',userId).eq('run->>callVersion',String(previous.callVersion)).select('id');
    if (saved.error || saved.data?.length!==1) throw Error('QA_BUDGET_CAS_FAILED');
  }
  const prepared=await read();
  if (prepared.evalRunId) throw Error('QA_GENERATION_ALREADY_CLAIMED');
  await write(prepared,{...prepared,evalRunId,callVersion:prepared.callVersion+1});
  return {
    beforeModel:async(span:EvalSpan)=>{
      if (hostedStepModel()!=='step-3.7-flash') throw Error('QA_HOSTED_MODEL_CHANGED');
      const options=(span.input as {options?:{maxTokens?:number}})?.options;
      const output=options?.maxTokens;
      if (typeof output!=='number' || !Number.isSafeInteger(output) || output<1 || output>16384) {
        throw Error('QA_OUTPUT_RESERVE_INVALID');
      }
      const previous=await read();
      // Full serialized input bytes plus protocol overhead bounds input tokens;
      // both price rates exceed the configured site's recorded reference rates.
      const inputUpper=Buffer.byteLength(JSON.stringify(span.input))+8192;
      const reservedCny=(1.5*inputUpper+9*output)/1e6;
      if (previous.calls.length>=previous.capCalls || spent(previous)+reservedCny>previous.capCny) {
        throw Error('QA_BUDGET_EXHAUSTED');
      }
      await write(previous,{...previous,callVersion:previous.callVersion+1,
        calls:[...previous.calls,{id:span.id,reservedCny}]});
    },
    afterModel:async(span:EvalSpan)=>{
      const previous=await read(),entry=previous.calls.find(call=>call.id===span.id);
      if (!entry) return; // A local refusal before reservation incurs no model request.
      const usage=span.usage;
      if (span.status!=='completed' || !usage || span.model!=='step-3.7-flash'
        || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens<0
        || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens<0) return;
      const settledUpperCny=(1.5*usage.inputTokens+9*usage.outputTokens)/1e6;
      if (settledUpperCny>entry.reservedCny) throw Error('QA_USAGE_ABOVE_RESERVE');
      await write(previous,{...previous,callVersion:previous.callVersion+1,
        calls:previous.calls.map(call=>call.id===span.id?{...call,settledUpperCny,
          inputTokens:usage.inputTokens,outputTokens:usage.outputTokens}:call)});
    },
  };
}
