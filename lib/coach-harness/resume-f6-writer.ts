import accepted from './f6-accepted.json';
import origin from './f6-origin.json';
import {createHash} from 'node:crypto';
import { projectF6Document } from './resume-f6-projection';
import {captureEvalStage} from './eval-scope';
import {F6ToolSession, F6_ORIGIN_TOOLS, type F6ResourceId, type F6ToolServices} from './f6-tool-session';
import type { LlmMessage, NativeTool, NativeToolCall } from '../llm-tools';

export const F6_RESUME_WRITER = 'f6-origin-runtime-v3';
export const F6_MAX_AUTHOR_CALLS = origin.maxAuthorCalls;
type Id = F6ResourceId;
type Input = {
  resume: string; jd: string; facts: Array<{ id: string; text: string }>;
  request: string; answers: unknown; decisions: unknown; scope: 'whole' | 'single'; format: unknown;
  company?: string; domain?: string;
  /** Explicit automatic-review comparison baseline only, never the shipped F6 route. */
  legacySuggestionProtocol?: boolean;
  previousDraft?: string; reviewFeedback?: string[];
};
type Call = (messages: LlmMessage[], phase: 'read_or_write' | 'write', readIds: Id[], tools: NativeTool[]) => Promise<string>;
type VerifyDocument = (body:string) => string[];
export type F6Checkpoint = {messages: LlmMessage[]; readIds: Id[]; completedAuthorCalls: number;
  publicCalls: Array<{name: string; output: Record<string, unknown>}>};

function parse(reply: string): Record<string, unknown> {
  const value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('F6_WRITER_PROTOCOL_INVALID');
  return value;
}

/** Two-message accepted F6 context, not a replacement product-writing prompt.
 * Scope/owned materials are task parameters; tools/resources are origin-frozen. */
export function f6InitialMessages(input: Input): LlmMessage[] {
  const scope = input.scope === 'single' ? '本次只改本次授权的那一段经历。' : '本次改整份授权简历，按已有方向优化。';
  const system = accepted.system
    .replace('本次只写 Manus「Agent 产品经理」投递稿的「益职 AI」项目段。', scope)
    .replace('在该项目段取舍、重排和编辑。', '在授权范围内取舍、重排和编辑。')
    .replace('本次交付只有项目段正文，以「### 益职 AI」开头，可直接回复或通过 write_output 保存为 resume-new.md。',
      '本次交付完整的授权范围正文，可直接回复或通过 write_output 保存为 resume-new.md。');
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({
      task: scope, 'resume.md': input.resume, 'jd.txt': input.jd, 'facts.md': input.facts,
      answers: input.answers, editingRequest: input.request, priorDecisions: input.decisions,
      ...(input.previousDraft ? {previousDraft:input.previousDraft,reviewFeedback:input.reviewFeedback,
        repairInstruction:'这是独立检查给原作者的诊断，不是候选人事实或正确答案。逐项对照原稿与候选核实；修正有依据的问题，不照单补写新事实。交回完整修订稿。'} : {}),
      public_hiring_case_notes: accepted.publicHiringCases,
      optional_read_file_examples: accepted.catalogue,
    }) },
  ];
}

/** Accepted loop: native choices -> actual tool result -> next choice. Saving a
 * valid body completes the task, exactly as the original experiment did. */
export async function runF6ResumeWriter(input: Input, call: Call, onRead: (ids: Id[]) => void,
  verifyDocument?: VerifyDocument, services?: F6ToolServices, checkpoint?: F6Checkpoint) {
  const initial = f6InitialMessages(input);
  if (checkpoint && (JSON.stringify(checkpoint.messages.slice(0, 2)) !== JSON.stringify(initial)
    || checkpoint.completedAuthorCalls < 1 || checkpoint.completedAuthorCalls >= F6_MAX_AUTHOR_CALLS)) {
    throw Error('F6_CHECKPOINT_INPUT_CHANGED');
  }
  const messages = checkpoint ? structuredClone(checkpoint.messages) : initial;
  const readIds: Id[] = checkpoint ? [...checkpoint.readIds] : [];
  const rejectedBodies=new Set<string>();
  const verify=(body:string)=>{
    const issues=verifyDocument?.(body)||[];
    if(issues.length){
      if(rejectedBodies.has(body))throw Error('F6_REPAIR_NO_PROGRESS');
      rejectedBodies.add(body);
    }
    return issues;
  };
  const session = new F6ToolSession(input, verify, services, checkpoint?.publicCalls);
  const started = Date.now();
  captureEvalStage('context', 'f6_origin_runtime_contract', {input: {
    messages, tools: F6_ORIGIN_TOOLS,
  }, output: {
    writer: F6_RESUME_WRITER, originSystemHash: origin.systemHash,
    actualSystemHash: createHash('sha256').update(messages[0].content).digest('hex'),
    taskParameterChanges: ['authorised scope', 'owned résumé/JD/facts/answers/decisions'],
    resourceHashes: origin.resourceHashes, maxAuthorCalls: F6_MAX_AUTHOR_CALLS,
    resumedFromAuthorCall: checkpoint?.completedAuthorCalls || 0,
    orderedWorkflow: false, extraAutomaticJudge: false,
  }}, started, 0);
  for (let turn = checkpoint?.completedAuthorCalls || 0; turn < F6_MAX_AUTHOR_CALLS; turn++) {
    const reply = await call(structuredClone(messages), turn ? 'write' : 'read_or_write', [...readIds], F6_ORIGIN_TOOLS);
    let value: Record<string, unknown>;
    try { value = parse(reply); } catch {
      if (reply.trim().startsWith('{') || !reply.trim()) throw Error('F6_WRITER_PROTOCOL_INVALID');
      const issues=verify(reply);
      if(issues.length){
        messages.push({role:'assistant',content:reply});
        messages.push({role:'user',content:JSON.stringify({
          programmaticVerification:{saved:false,issues},
          instruction:'程序未接收这版。核对原稿和本人补充后修正有依据的问题，交回完整新稿；这些诊断不是候选人事实，不得据此补造经历。',
        })});
        continue;
      }
      session.captureVisibleBody(reply);
      captureEvalStage('draft','host_capture_visible_body',{input:'ordinary visible model reply',
        output:{characters:reply.length,bytePreserved:true}},Date.now(),0);
      return deliver(reply);
    }
    // Explicit former automatic-review comparison only. The production F6
    // route cannot fall back to the old per-suggestion response protocol.
    if (input.legacySuggestionProtocol && Array.isArray(value.changes)) return reply;
    if (value.type !== 'native_tool_calls' || !Array.isArray(value.tool_calls)) throw Error('F6_WRITER_PROTOCOL_INVALID');
    const calls = value.tool_calls as NativeToolCall[];
    messages.push({ role: 'assistant', content: String(value.content || ''), tool_calls: calls });
    for (const request of calls) {
      const toolStarted = Date.now();
      let args: Record<string, unknown> = {}, result: Record<string, unknown>;
      try {
        args = parse(request.function.arguments);
        result = await session.invoke(request.function.name, args);
        if (request.function.name === 'read_file') {
          const id = args.file as Id;
          readIds.push(id); onRead([id]);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'F6_REPAIR_NO_PROGRESS') throw error;
        result = {error: error instanceof Error ? error.message : 'TOOL_FAILED'};
      }
      captureEvalStage('retrieval', 'f6_tool_' + request.function.name,
        {input: {toolCallId: request.id, arguments: args}, output: result}, toolStarted, Date.now() - toolStarted);
      messages.push({ role: 'tool', tool_call_id: request.id, content: JSON.stringify(result) });
    }
    const body = session.outputs.get('resume-new.md');
    if (body) return deliver(body, session.outputs.get('notes.md'));
  }
  throw Error('F6_AUTHOR_CALL_BUDGET_EXHAUSTED');

  function deliver(body: string, receipt?: string) {
    if (!body.trim() || body.length > 30_000) throw Error('F6_WRITE_OUTSIDE_SCOPE');
    const changes = projectF6Document(input.resume, body).map(change => ({
      ...change, section: input.scope === 'single' ? '经历整体重写' : '整稿选材与重构',
      reason: 'F6 作者交付完整重写稿，宿主生成原位差异供确认；程序接收不等于独立语义审稿通过。',
      sourceIds: input.facts.filter(fact => change.before.includes(fact.text) || fact.text.includes(change.before)).map(fact => fact.id),
    }));
    return JSON.stringify({ changes, fullDocument: body, f6Deliverables: session.deliverables(),
      ...(receipt ? { selectionReceipt: receipt } : {}),
      ...(!changes.length ? { status: 'unchanged' } : {}) });
  }
}

/** Losing the verb around the same number changes a measured delta into a
 * metric level. A direction-bearing value may be dropped altogether when
 * legitimate, but must not survive as an unqualified numeric claim. */
export function f6MetricDirectionIssues(before:string, after:string):string[]{
  const norm=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').replace(/个(?=百分点)/g,'');
  const a=norm(after), b=norm(before);
  const change=/(提升|提高|增加|增长|上升|改善|下降|降低|减少|下滑|回落)(?:了|约|达|近)?(\d+(?:\.\d+)?)(个百分点|百分点|pp|%)/gi;
  const issue='保留指标数值时必须保留增减方向；不能把变化量写成指标当前水平。';
  for(const match of b.matchAll(change)){
    const [,verb,n,unit]=match;
    const scalar=n.replace('.','\\.')+'(?:'+(unit.toLowerCase()==='%'?'%':'百分点|pp')+')';
    const present=new RegExp('(?<![\\d.])'+scalar,'i');
    const direction=/提升|提高|增加|增长|上升|改善/.test(verb)?'提升|提高|增加|增长|上升|改善|\\+':'下降|降低|减少|下滑|回落|-';
    if(present.test(a)&&!new RegExp('(?:'+direction+')(?:了|约|达|近)?'+scalar,'i').test(a))return [issue];
  }
  return [];
}
