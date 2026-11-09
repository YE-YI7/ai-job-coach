import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {redactEval, type EvalSpan} from './eval-scope';
import type {compileContextBundle} from './context';
import type {LlmMessage, NativeTool} from '@/lib/llm-tools';
import origin from './f6-origin.json';
import type {F6Checkpoint} from './resume-f6-writer';
import type {F6ReproSection} from './f6-repro-input';

// This is one pre-funded repair, not a reusable free-model entitlement.
export const F6_ACCEPTANCE_ID = '8727b32a-6de0-4bc4-906d-44754202f8fb';
export const F6_FAILURE_ID = 'eae90be2-b0de-4187-8267-3ff15726cf13';
// User extended calls from 6 to 9; the original CNY 0.30 cap is unchanged.
const PRIOR_CALLS = 3, PRIOR_UPPER_CNY = 0.110348, TOTAL_CALLS = 9, TOTAL_CNY = 0.30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
type Usage = {inputTokens: number; outputTokens: number; cacheHitTokens?: number | null};
export function f6UsageUpperCny(usage: Usage) {
  const hits = Number.isInteger(usage.cacheHitTokens) && usage.cacheHitTokens! >= 0
    && usage.cacheHitTokens! <= usage.inputTokens ? usage.cacheHitTokens! : 0;
  return {coldUpperCny:(2*usage.inputTokens+8*usage.outputTokens)/1e6,
    settledCny:(2*(usage.inputTokens-hits)+0.04*hits+8*usage.outputTokens)/1e6,cacheHitTokens:hits};
}
export type F6AcceptanceExecution = {
  context: ReturnType<typeof compileContextBundle>;
  model: 'deepseek-v4-flash';
  checkpoint?: F6Checkpoint;
  /** Separate admin-only reproduction. Absent for the original 8727 run. */
  section?: F6ReproSection;
  beforeCall: (messages: LlmMessage[], tools?: NativeTool[]) => Promise<void>;
  onUsage: (usage: Usage) => void;
};

export function restoreF6Checkpoint(spans: EvalSpan[]): F6Checkpoint {
  const agents = spans.filter(span => span.kind === 'agent');
  const last = agents.at(-1);
  if (!last || agents.some(span => span.status !== 'completed' || !span.usage)
    || spans.some(span => span.code === 'f6_tool_write_output')) throw Error('ACCEPTANCE_CHECKPOINT_INVALID');
  const input = last.input as {messages: LlmMessage[]};
  const reply = JSON.parse(String(last.output));
  if (reply.type !== 'native_tool_calls' || !Array.isArray(reply.tool_calls)) throw Error('ACCEPTANCE_CHECKPOINT_INVALID');
  const messages: LlmMessage[] = [...input.messages,
    {role: 'assistant', content: reply.content || '', tool_calls: reply.tool_calls}];
  for (const tool of reply.tool_calls) {
    const receipt = spans.findLast(span => (span.input as {toolCallId?: string})?.toolCallId === tool.id
      && span.code === 'f6_tool_' + tool.function.name);
    if (!receipt) throw Error('ACCEPTANCE_TOOL_RECEIPT_MISSING');
    const raw = receipt.output as Record<string, unknown>;
    // This last tool result was not yet delivered to the model. Restore the
    // original F6 fetch projection, without the index-only metadata that the
    // first product port accidentally copied onto an actually-read page.
    // Original receipt and page text remain untouched in the stored Trace.
    const output = tool.function.name === 'fetch' && Array.isArray(raw.pages)
      ? {pages: raw.pages.map(page => ({url:page.url,title:page.title,sourceType:page.sourceType,text:page.text}))} : raw;
    messages.push({role: 'tool', tool_call_id: tool.id, content: JSON.stringify(output)});
  }
  return {messages, completedAuthorCalls: agents.length,
    readIds: spans.filter(span => span.code === 'f6_tool_read_file').map(span =>
      (span.input as {arguments: {file: F6Checkpoint['readIds'][number]}}).arguments.file),
    publicCalls: spans.filter(span => ['f6_tool_search', 'f6_tool_fetch'].includes(span.code || '')).map(span =>
      ({name: span.code!.slice('f6_tool_'.length), output: span.output as Record<string, unknown>}))};
}

/** The admin route can consume only a once-prepared, owned audit clone. The
 * database claim is atomic and precedes calls; ambiguous/crashed calls remain
 * reserved and cannot be restarted or charged to a personal account. */
export async function claimF6Acceptance(userId: string) {
  const db = await getDbClient();
  if (!db) throw Error('ACCEPTANCE_DATABASE_REQUIRED');
  const row = await db.from('coach_eval_runs').select('run,status').eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId).single();
  if (row.error || !row.data) throw Error('ACCEPTANCE_NOT_PREPARED_OR_ALREADY_USED');
  const run = row.data.run;
  const resume = row.data.status === 'failed' && run.result?.output?.error === 'ACCEPTANCE_BUDGET_EXHAUSTED'
    && run.cost?.newCalls?.length === 3;
  if (row.data.status !== 'prepared' && !resume) throw Error('ACCEPTANCE_NOT_PREPARED_OR_ALREADY_USED');
  const checkpoint = resume ? restoreF6Checkpoint(run.spans) : undefined;
  if (run.sourceEvalId !== F6_FAILURE_ID || !run.opportunityId || !run.taskId
    || !run.request || !run.expectedInput || !run.frozenContext
    || !Number.isFinite(Date.parse(run.expiresAt)) || Date.parse(run.expiresAt) <= Date.now()) throw Error('ACCEPTANCE_MANIFEST_INVALID');
  const claimed = await db.from('coach_eval_runs').update({status: 'running', run: {...run, status: 'running'}})
    .eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId).eq('status', row.data.status).select('id').maybeSingle();
  if (claimed.error || !claimed.data) throw Error('ACCEPTANCE_ALREADY_CLAIMED');
  const spans: EvalSpan[] = resume ? run.spans : [], ledger: Array<{reservedCny: number; settledCny?: number;
    coldUpperCny?: number; cacheHitTokens?: number; requestHash: string;
    promptUpperTokens: number; reservationBasis: string}> = resume ? run.cost.newCalls : [];
  const callsAtClaim = ledger.length;
  let sentPrefix: string[] = [], measuredPrefix: {messages: string[]; inputTokens: number} | undefined;
  if (resume) {
    const last = spans.filter(span => span.kind === 'agent').at(-1)!;
    measuredPrefix = {messages: (last.input as {messages: LlmMessage[]}).messages.map(message => JSON.stringify(message)),
      inputTokens: last.usage!.inputTokens};
    run.attempts = [...(run.attempts || []), structuredClone({status:run.status,result:run.result,durationMs:run.durationMs,metrics:run.metrics,cost:run.cost})];
    run.priorDurationMs = run.durationMs || 0;
    const agents = spans.filter(span => span.kind === 'agent');
    if (agents.length !== ledger.length) throw Error('ACCEPTANCE_USAGE_LEDGER_MISMATCH');
    agents.forEach((span,index) => Object.assign(ledger[index],f6UsageUpperCny(span.usage!)));
  }
  Object.assign(run, {status: 'running', spans, startedAt: new Date().toISOString(), cost: {
    totalCapCny: TOTAL_CNY, totalCapCalls: TOTAL_CALLS, priorCalls: PRIOR_CALLS, priorUpperCny: PRIOR_UPPER_CNY,
    actualSupplierChargeCny: null, newCalls: ledger,
  }});
  const save = async () => {
    run.cost.newUpperCny = ledger.reduce((sum, entry) => sum + (entry.settledCny ?? entry.reservedCny), 0);
    run.cost.cumulativeUpperCny = PRIOR_UPPER_CNY + run.cost.newUpperCny;
    run.cost.coldCumulativeUpperCny = PRIOR_UPPER_CNY
      + ledger.reduce((sum,entry)=>sum+(entry.coldUpperCny??entry.reservedCny),0);
    run.cost.pricingBasis = 'official peak prices; measured cache hits 0.04 CNY/M, misses 2, output 8; unknown hits charged cold';
    const calls = spans.filter(span => span.kind === 'agent');
    run.metrics = {calls: ledger.length, inputTokens: calls.reduce((sum, span) => sum + (span.usage?.inputTokens || 0), 0),
      outputTokens: calls.reduce((sum, span) => sum + (span.usage?.outputTokens || 0), 0),
      modelMs: calls.reduce((sum, span) => sum + span.durationMs, 0), referenceCnyUpper: run.cost.newUpperCny};
    const result = await db.from('coach_eval_runs').update({run: redactEval(run), status: run.status,
      updated_at: new Date().toISOString()}).eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId);
    if (result.error) throw Error('ACCEPTANCE_LEDGER_SAVE_FAILED');
  };
  const owned = await db.from('coach_opportunities').select('metadata').eq('id', run.opportunityId).eq('user_id', userId).single();
  if (owned.error || owned.data?.metadata?.auditRun !== F6_ACCEPTANCE_ID) throw Error('ACCEPTANCE_CLONE_REQUIRED');
  if (resume) {
    const task = await db.from('coach_resume_tasks').select('lease_id,state').eq('id',run.taskId)
      .eq('user_id',userId).eq('opportunity_id',run.opportunityId).single();
    if (task.error || task.data?.state !== 'running' || !task.data.lease_id) throw Error('ACCEPTANCE_TASK_NOT_RESUMABLE');
    // Private request capture redacts leases; recover only this owned clone's
    // current server-side lease, never a credential supplied by the browser.
    run.request.resumeTaskLease = task.data.lease_id;
  }
  const execution: F6AcceptanceExecution = {
    context: run.frozenContext, model: 'deepseek-v4-flash',
    ...(checkpoint ? {checkpoint} : {}),
    beforeCall: async (messages, tools) => {
      if (!tools) throw Error('ACCEPTANCE_UNEXPECTED_EXTRA_MODEL');
      if (JSON.stringify(tools) !== JSON.stringify(origin.tools)) throw Error('ACCEPTANCE_ORIGIN_TOOLS_CHANGED');
      if (ledger.length === callsAtClaim) {
        if (messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
          || messages.filter(message => message.role === 'system').length !== 1) {
          throw Error('ACCEPTANCE_EXTRA_SYSTEM_INSTRUCTIONS');
        }
        const actual = JSON.parse(messages.find(message => message.role === 'user')!.content);
        for (const key of ['resume.md', 'jd.txt', 'facts.md', 'answers', 'editingRequest', 'priorDecisions']) {
          if (JSON.stringify(actual[key]) !== JSON.stringify(run.expectedInput[key])) throw Error('ACCEPTANCE_FAILED_INPUT_CHANGED_' + key);
        }
      }
      const payload = JSON.stringify({messages, tools});
      const serialised = messages.map(message => JSON.stringify(message));
      const prefixUnchanged = measuredPrefix && measuredPrefix.messages.every((message, index) => serialised[index] === message);
      // After a measured call, the identical prefix (including tool schemas)
      // already has a supplier token count. Bound only newly appended bytes;
      // do not repeatedly reserve the entire Chinese prompt as UTF-8 bytes.
      const incrementalUpper = prefixUnchanged ? measuredPrefix!.inputTokens
        + serialised.slice(measuredPrefix!.messages.length).reduce((sum, message) => sum + Buffer.byteLength(message), 0)
        + 2048 : Infinity;
      const wholeUpper = Buffer.byteLength(payload) + 8192;
      const promptUpperTokens = Math.min(wholeUpper, incrementalUpper);
      const reservedCny = (2 * promptUpperTokens + 8 * 7500) / 1e6;
      const spent = PRIOR_UPPER_CNY + ledger.reduce((sum, entry) => sum + (entry.settledCny ?? entry.reservedCny), 0);
      if (PRIOR_CALLS + ledger.length >= TOTAL_CALLS || spent + reservedCny > TOTAL_CNY) throw Error('ACCEPTANCE_BUDGET_EXHAUSTED');
      sentPrefix = serialised;
      ledger.push({reservedCny, requestHash: sha(payload), promptUpperTokens,
        reservationBasis: incrementalUpper < wholeUpper ? 'measured_identical_prefix_plus_appended_utf8_bytes' : 'full_payload_utf8_upper_bound'});
      await save();
    },
    onUsage: usage => {
      const last = ledger.at(-1);
      if (last && Number.isInteger(usage.inputTokens) && Number.isInteger(usage.outputTokens)) {
        Object.assign(last,f6UsageUpperCny(usage));
        measuredPrefix = {messages: [...sentPrefix], inputTokens: usage.inputTokens};
        if (last.settledCny! > last.reservedCny) throw Error('ACCEPTANCE_USAGE_ABOVE_RESERVED_STOP');
      }
    },
  };
  return {run, spans, save, execution};
}
