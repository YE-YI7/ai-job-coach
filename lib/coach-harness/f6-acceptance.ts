import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {redactEval, type EvalSpan} from './eval-scope';
import type {compileContextBundle} from './context';
import type {LlmMessage, NativeTool} from '@/lib/llm-tools';
import origin from './f6-origin.json';

// This is one pre-funded repair, not a reusable free-model entitlement.
export const F6_ACCEPTANCE_ID = '8727b32a-6de0-4bc4-906d-44754202f8fb';
export const F6_FAILURE_ID = 'eae90be2-b0de-4187-8267-3ff15726cf13';
const PRIOR_CALLS = 3, PRIOR_UPPER_CNY = 0.110348, TOTAL_CALLS = 6, TOTAL_CNY = 0.30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
type Usage = {inputTokens: number; outputTokens: number};
export type F6AcceptanceExecution = {
  context: ReturnType<typeof compileContextBundle>;
  model: 'deepseek-v4-flash';
  beforeCall: (messages: LlmMessage[], tools?: NativeTool[]) => Promise<void>;
  onUsage: (usage: Usage) => void;
};

/** The admin route can consume only a once-prepared, owned audit clone. The
 * database claim is atomic and precedes calls; ambiguous/crashed calls remain
 * reserved and cannot be restarted or charged to a personal account. */
export async function claimF6Acceptance(userId: string) {
  const db = await getDbClient();
  if (!db) throw Error('ACCEPTANCE_DATABASE_REQUIRED');
  const row = await db.from('coach_eval_runs').select('run,status').eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId).single();
  if (row.error || !row.data || row.data.status !== 'prepared') throw Error('ACCEPTANCE_NOT_PREPARED_OR_ALREADY_USED');
  const run = row.data.run;
  if (run.sourceEvalId !== F6_FAILURE_ID || !run.opportunityId || !run.taskId
    || !run.request || !run.expectedInput || !run.frozenContext
    || !Number.isFinite(Date.parse(run.expiresAt)) || Date.parse(run.expiresAt) <= Date.now()) throw Error('ACCEPTANCE_MANIFEST_INVALID');
  const claimed = await db.from('coach_eval_runs').update({status: 'running', run: {...run, status: 'running'}})
    .eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId).eq('status', 'prepared').select('id').maybeSingle();
  if (claimed.error || !claimed.data) throw Error('ACCEPTANCE_ALREADY_CLAIMED');
  const spans: EvalSpan[] = [], ledger: Array<{reservedCny: number; settledCny?: number;
    requestHash: string; promptUpperTokens: number; reservationBasis: string}> = [];
  let sentPrefix: string[] = [], measuredPrefix: {messages: string[]; inputTokens: number} | undefined;
  Object.assign(run, {status: 'running', spans, startedAt: new Date().toISOString(), cost: {
    totalCapCny: TOTAL_CNY, totalCapCalls: TOTAL_CALLS, priorCalls: PRIOR_CALLS, priorUpperCny: PRIOR_UPPER_CNY,
    actualSupplierChargeCny: null, newCalls: ledger,
  }});
  const save = async () => {
    const result = await db.from('coach_eval_runs').update({run: redactEval(run), status: run.status,
      updated_at: new Date().toISOString()}).eq('id', F6_ACCEPTANCE_ID).eq('user_id', userId);
    if (result.error) throw Error('ACCEPTANCE_LEDGER_SAVE_FAILED');
  };
  const owned = await db.from('coach_opportunities').select('metadata').eq('id', run.opportunityId).eq('user_id', userId).single();
  if (owned.error || owned.data?.metadata?.auditRun !== F6_ACCEPTANCE_ID) throw Error('ACCEPTANCE_CLONE_REQUIRED');
  const execution: F6AcceptanceExecution = {
    context: run.frozenContext, model: 'deepseek-v4-flash',
    beforeCall: async (messages, tools) => {
      if (!tools) throw Error('ACCEPTANCE_UNEXPECTED_EXTRA_MODEL');
      if (JSON.stringify(tools) !== JSON.stringify(origin.tools)) throw Error('ACCEPTANCE_ORIGIN_TOOLS_CHANGED');
      if (!ledger.length) {
        if (JSON.stringify(messages.map(message => message.role)) !== '["system","user"]') {
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
        last.settledCny = (2 * usage.inputTokens + 8 * usage.outputTokens) / 1e6;
        measuredPrefix = {messages: [...sentPrefix], inputTokens: usage.inputTokens};
        if (last.settledCny > last.reservedCny) throw Error('ACCEPTANCE_USAGE_ABOVE_RESERVED_STOP');
      }
    },
  };
  return {run, spans, save, execution};
}
