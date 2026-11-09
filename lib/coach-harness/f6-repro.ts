import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {getDbClient} from '@/lib/db';
import {getContextBundleForUser} from './repository';
import {redactEval, type EvalSpan} from './eval-scope';
import {f6InitialMessages} from './resume-f6-writer';
import {F6_ORIGIN_TOOLS} from './f6-tool-session';
import {f6UsageUpperCny, type F6AcceptanceExecution} from './f6-acceptance';
import type {F6ReproSection} from './f6-repro-input';
import type {LlmMessage, NativeTool} from '@/lib/llm-tools';

// Three owner-authorized, once-only parity trials. Not a general free endpoint.
export const F6_REPRO_BATCH = '46c8c70b-0cc7-4d52-b653-a5be5e604a74';
export const F6_REPRO_IDS = ['10163ccd-ebd1-4b05-9258-93af91e64bab',
  'e6994dac-2d8f-4d7d-ba45-b8b7d68e4efd', '76b56321-8b2c-4321-b242-beaeb5a8e8ab'];
export const F6_REPRO_CAP_CNY = 0.5;
type Usage = Parameters<F6AcceptanceExecution['onUsage']>[0];
type Entry = {trialId: string; reservedCny: number; estimatedCny?: number; coldUpperCny?: number;
  cacheHitTokens?: number; requestHash: string};
export type ReproLedger = {calls: Entry[]};
type Trial = {
  id: string; batchId: string; source: string; expiresAt: string; sourceId: string; sourceSha256: string;
  section: F6ReproSection; expectedMessages: LlmMessage[]; opportunityId: string; taskId: string;
  request: Record<string, unknown>; spans: EvalSpan[]; status: string; startedAt: string;
  result?: unknown; preflight?: unknown; durationMs?: number; cost?: unknown;
};
type Batch = ReproLedger & {trialIds: string[]; finished: string[]; activeTrial?: string | null; source: string};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
export const f6ReproSpent = (ledger: ReproLedger) => ledger.calls.reduce((sum, entry) =>
  sum + (entry.estimatedCny ?? entry.reservedCny), 0);

export function reserveF6ReproCall(ledger: ReproLedger, trialId: string, messages: LlmMessage[], tools?: NativeTool[]) {
  if (!F6_REPRO_IDS.includes(trialId) || !isDeepStrictEqual(tools, F6_ORIGIN_TOOLS)) throw Error('F6_REPRO_TOOLS_CHANGED');
  const payload = JSON.stringify({messages, tools});
  const reservedCny = (2 * (Buffer.byteLength(payload) + 8192) + 8 * 7500) / 1e6;
  if (ledger.calls.length >= 36 || ledger.calls.filter(entry => entry.trialId === trialId).length >= 12
    || f6ReproSpent(ledger) + reservedCny > F6_REPRO_CAP_CNY) throw Error('F6_REPRO_BUDGET_EXHAUSTED');
  const entry = {trialId, reservedCny, requestHash: sha(payload)};
  ledger.calls.push(entry);
  return entry;
}

function checked<T=unknown>(result: {data: unknown; error: {message: string} | null}): T {
  if (result.error) throw Error(result.error.message);
  return result.data as T;
}

/** Fresh production repository read, no model and no writes. Text must match the
 * imported source AND every source line must be in the real citable selection. */
export async function readF6ReproInput(userId: string, id: string) {
  if (!F6_REPRO_IDS.includes(id)) throw Error('F6_REPRO_UNKNOWN_ID');
  const db = await getDbClient(); if (!db) throw Error('F6_REPRO_DATABASE_REQUIRED');
  const row = checked<{run:Trial;status:string}>(await db.from('coach_eval_runs').select('run,status').eq('id', id).eq('user_id', userId).single());
  const run = row.run as Trial;
  if (run.batchId !== F6_REPRO_BATCH || run.source !== 'f6-repro-v1'
    || !Number.isFinite(Date.parse(run.expiresAt)) || Date.parse(run.expiresAt) < Date.now()) throw Error('F6_REPRO_MANIFEST_INVALID');
  const source = checked<{content:string;content_hash:string}>(await db.from('coach_sources')
    .select('content,content_hash').eq('id', run.sourceId).eq('user_id', userId).single());
  if (source.content !== run.section.facts || source.content_hash !== run.sourceSha256
    || sha(source.content) !== run.sourceSha256) throw Error('F6_REPRO_FACT_TEXT_CHANGED');
  const owned = checked<{metadata:{auditRun?:string;auditBatch?:string}}>(await db.from('coach_opportunities')
    .select('metadata').eq('id', run.opportunityId).eq('user_id', userId).single());
  if (owned.metadata?.auditRun !== id || owned.metadata?.auditBatch !== F6_REPRO_BATCH) throw Error('F6_REPRO_CLONE_REQUIRED');
  const task = checked<{lease_id:string;state:string;answers:unknown[]}>(await db.from('coach_resume_tasks').select('lease_id,state,answers').eq('id',run.taskId)
    .eq('user_id',userId).eq('opportunity_id',run.opportunityId).single());
  if (row.status === 'prepared' && (task.state !== 'running' || !task.lease_id || task.answers?.length)) {
    throw Error('F6_REPRO_NEW_EMPTY_TASK_REQUIRED');
  }
  const context = await getContextBundleForUser({userId, task: 'resume_workshop', opportunityId: run.opportunityId,
    questionSource: {id: 'base-resume', text: run.section.resume}, retrievalQuery: run.section.resume,
    budget: {maxInputTokens: 12000}, knowledgeLimit: 2});
  const allowed = new Set([...context.allowedClaimIds, ...context.unverifiedClaimIds]);
  const imported = context.claims.filter(claim => run.section.claimIds.includes(claim.id) && allowed.has(claim.id));
  if (imported.length !== new Set(run.section.claimIds).size
    || imported.some(claim => claim.sourceId !== run.sourceId || !source.content.includes(claim.displayText))) {
    throw Error('F6_REPRO_REAL_CONTEXT_MISSING_IMPORTED_FACTS');
  }
  const messages = f6InitialMessages({resume: run.section.excerpt, jd: String(run.request.jobDescription),
    facts: imported.map(claim => ({id: claim.id, text: claim.displayText})), answers: [], decisions: [], request: '',
    scope: 'single', format: {}, acceptedSection: run.section});
  if (!isDeepStrictEqual(messages, run.expectedMessages)) throw Error('F6_REPRO_FIRST_REQUEST_DIFF');
  const preflight = {modelCalls: 0, importedFacts: imported.length, originalFactsVerbatim: true,
    fullResumeCharacters: run.section.resume.length, onlySectionOutput: true, oldInstructions: false,
    sourceId: run.sourceId, sourceSha256: run.sourceSha256, inputMessages: messages,
    tools: F6_ORIGIN_TOOLS, actualSystemSha256: sha(messages[0].content),
    firstRequestEqualToFrozenF6: true, guardPolicy: 'existing program checks; imported project evidence is in scope'};
  return {db, row, run, context, preflight, task};
}

export async function claimF6Repro(userId: string, id: string) {
  const input = await readF6ReproInput(userId, id);
  const {db, run, context, preflight} = input;
  if (input.row.status !== 'prepared') throw Error('F6_REPRO_ALREADY_USED');
  const parent = checked<{run:Batch;status:string}>(await db.from('coach_eval_runs')
    .select('run,status').eq('id',F6_REPRO_BATCH).eq('user_id',userId).single());
  const batch = parent.run as Batch;
  if (parent.status !== 'prepared' || batch.source !== 'f6-repro-batch-v1'
    || !isDeepStrictEqual(batch.trialIds, F6_REPRO_IDS) || batch.finished.includes(id)) throw Error('F6_REPRO_BATCH_BUSY_OR_CLOSED');
  const lock = checked(await db.from('coach_eval_runs').update({status:'running',run:{...batch,activeTrial:id}})
    .eq('id',F6_REPRO_BATCH).eq('user_id',userId).eq('status','prepared').select('id').maybeSingle());
  if (!lock) throw Error('F6_REPRO_BATCH_ALREADY_CLAIMED');
  const claim = checked(await db.from('coach_eval_runs').update({status:'running'})
    .eq('id',id).eq('user_id',userId).eq('status','prepared').select('id').maybeSingle());
  if (!claim) throw Error('F6_REPRO_ALREADY_CLAIMED');
  run.spans = []; run.status = 'running'; run.startedAt = new Date().toISOString(); run.preflight = preflight;
  batch.activeTrial = id;
  const save = async () => {
    run.cost = {capCny:F6_REPRO_CAP_CNY,capCalls:36,perTrialCap:12,actualSupplierChargeCny:null,
      batchEstimatedCny:f6ReproSpent(batch),trialCalls:batch.calls.filter(entry=>entry.trialId===id),
      trialEstimatedCny:f6ReproSpent({calls:batch.calls.filter(entry=>entry.trialId===id)}),
      estimateOnly:true,model:'deepseek-v4-flash',provider:'deepseek'};
    checked(await db.from('coach_eval_runs').update({run:redactEval(run),status:run.status,updated_at:new Date().toISOString()})
      .eq('id',id).eq('user_id',userId));
    checked(await db.from('coach_eval_runs').update({run:redactEval(batch),updated_at:new Date().toISOString()})
      .eq('id',F6_REPRO_BATCH).eq('user_id',userId).eq('status','running'));
  };
  const execution: F6AcceptanceExecution = {context,model:'deepseek-v4-flash',section:run.section,
    beforeCall:async(messages,tools)=>{
      if (!batch.calls.some(entry=>entry.trialId===id) && !isDeepStrictEqual(messages,run.expectedMessages)) {
        throw Error('F6_REPRO_FIRST_REQUEST_CHANGED');
      }
      reserveF6ReproCall(batch,id,messages,tools);
      await save(); // A durable reservation precedes EVERY supplier request.
    },
    onUsage:(usage:Usage)=>{
      const entry=batch.calls.at(-1);
      if (!entry || entry.trialId!==id) throw Error('F6_REPRO_USAGE_WITHOUT_RESERVATION');
      if (![usage.inputTokens,usage.outputTokens].every(value=>Number.isSafeInteger(value)&&value>=0)
        || (usage.cacheHitTokens!=null && (!Number.isSafeInteger(usage.cacheHitTokens)
          || usage.cacheHitTokens<0 || usage.cacheHitTokens>usage.inputTokens))) throw Error('F6_REPRO_INVALID_USAGE');
      const cost=f6UsageUpperCny(usage);
      if (cost.settledCny>entry.reservedCny) throw Error('F6_REPRO_USAGE_EXCEEDED_RESERVE');
      Object.assign(entry,{estimatedCny:cost.settledCny,coldUpperCny:cost.coldUpperCny,cacheHitTokens:cost.cacheHitTokens});
    },
  };
  await save();
  const finish=async(output:unknown,status:'completed'|'failed')=>{
    run.status=status;run.result=output;run.durationMs=Date.now()-Date.parse(run.startedAt);await save();
    batch.finished.push(id);batch.activeTrial=null;
    checked(await db.from('coach_eval_runs').update({run:redactEval(batch),
      status:batch.finished.length===3?'completed':'prepared',updated_at:new Date().toISOString()})
      .eq('id',F6_REPRO_BATCH).eq('user_id',userId).eq('status','running'));
  };
  const request={...run.request,resumeTaskLease:input.task.lease_id};
  return {run,spans:run.spans,save,finish,execution,request};
}
