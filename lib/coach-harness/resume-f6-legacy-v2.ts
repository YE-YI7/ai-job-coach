import accepted from './f6-accepted.json';
import { projectF6Document } from './resume-f6-projection';
import type { LlmMessage, NativeTool, NativeToolCall } from '../llm-tools';

export const F6_RESUME_WRITER = 'f6-accepted-document-v2';
export const F6_MAX_AUTHOR_CALLS = 6;
type Id = keyof typeof accepted.resources;
type Input = {
  resume: string; jd: string; facts: Array<{ id: string; text: string }>;
  request: string; answers: unknown; decisions: unknown; scope: 'whole' | 'single'; format: unknown;
  previousDraft?: string; reviewFeedback?: string[];
};
type Call = (messages: LlmMessage[], phase: 'read_or_write' | 'write', readIds: Id[], tools: NativeTool[]) => Promise<string>;
type VerifyDocument = (body:string) => string[];
const fields = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const tool = (name: string, description: string, parameters: Record<string, unknown>): NativeTool => ({
  type: 'function', function: { name, description, parameters },
});
const tools = [
  tool('read_file', 'Read the complete F6 task spec or an optional teaching case by catalogue ID. Cases are not candidate facts.',
    fields({ file: { type: 'string', enum: Object.keys(accepted.resources) } })),
  tool('write_output', 'Deliver the COMPLETE rewritten authorised résumé and optional selection receipt. The host derives reversible changes afterwards.',
    fields({ files: { type: 'array', minItems: 1, maxItems: 2, items: fields({
      name: { type: 'string', enum: ['resume-new.md', 'notes.md'] }, text: { type: 'string' },
    }) } })),
];

function parse(reply: string): Record<string, unknown> {
  const value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('F6_WRITER_PROTOCOL_INVALID');
  return value;
}

/** Exact accepted F6 map/resources; only company, task scope and host delivery
 * are parameterised. There is no mandatory selection turn or per-line limit. */
export async function runF6ResumeWriter(input: Input, call: Call, onRead: (ids: Id[]) => void, verifyDocument?:VerifyDocument) {
  const scope = input.scope === 'single' ? '本次只改本次授权的那一段经历。' : '本次改整份授权简历，按已有方向优化。';
  const system = accepted.system
    .replace('本次只写 Manus「Agent 产品经理」投递稿的「益职 AI」项目段。', scope)
    .replace('在该项目段取舍、重排和编辑。', '在授权范围内取舍、重排和编辑。')
    .replace('本次交付只有项目段正文，以「### 益职 AI」开头，可直接回复或通过 write_output 保存为 resume-new.md。',
      '本次交付完整的授权范围正文，可直接回复或通过 write_output 保存为 resume-new.md。');
  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({
      task: scope, 'resume.md': input.resume, 'jd.txt': input.jd, 'facts.md': input.facts,
      answers: input.answers, editingRequest: input.request, priorDecisions: input.decisions,
      ...(input.previousDraft ? {previousDraft:input.previousDraft,reviewFeedback:input.reviewFeedback,
        repairInstruction:'这是独立检查给原作者的诊断，不是候选人事实或正确答案。逐项对照原稿与候选核实；修正有依据的问题，不照单补写新事实。交回完整修订稿。'} : {}),
      public_hiring_case_notes: accepted.publicHiringCases,
      optional_read_file_examples: accepted.catalogue,
    }) },
    { role: 'system', content: [
      '这是 F6 的产品交付适配，不是逐句纠错接口。交付完整新稿，不要求逐句对应，不要求六条修改，不把原句当作不可重构的模板。',
      '工具目录：read_file 可按需读 spec.md、S006、S007；write_output 交整稿与选材回执。是否读、读哪项及何时交稿由你决定。',
      '当前未提供公开搜索或渲染工具，不声称搜索、实测页数或完成了不存在的验证；没有目标 JD 不猜公司门槛。',
      '每个重要主张、动机和判断只用同一经历的原文或明确归属的本人补充，不能把其他项目做法、验证或指标移植过去。',
      '原有姓名与联系方式原样保留。尊重用户已采纳/拒绝的决定。结构调整可作为整体建议供用户拒绝；不自动应用或删除。',
      '保持指标方向、单位、基准、责任和阶段。事实不等于全文照抄；从已有证据选择最能改变招聘判断的贡献。',
    ].join('\n') },
  ];
  const readIds: Id[] = [];
  const rejectedBodies=new Set<string>();
  const verify=(body:string)=>{
    const issues=verifyDocument?.(body)||[];
    if(issues.length){
      if(rejectedBodies.has(body))throw Error('F6_REPAIR_NO_PROGRESS');
      rejectedBodies.add(body);
    }
    return issues;
  };
  for (let turn = 0; turn < F6_MAX_AUTHOR_CALLS; turn++) {
    const reply = await call([...messages], turn ? 'write' : 'read_or_write', [...readIds], tools);
    let value: Record<string, unknown>;
    try { value = parse(reply); } catch {
      if (reply.trim().startsWith('{') || !reply.trim()) throw Error('F6_WRITER_PROTOCOL_INVALID');
      const issues=verify(reply.trim());
      if(issues.length){
        messages.push({role:'assistant',content:reply});
        messages.push({role:'user',content:JSON.stringify({
          programmaticVerification:{saved:false,issues},
          instruction:'程序未接收这版。核对原稿和本人补充后修正有依据的问题，交回完整新稿；这些诊断不是候选人事实，不得据此补造经历。',
        })});
        continue;
      }
      return deliver(reply.trim());
    }
    // Read compatibility for already queued responses only. New F6 requests
    // contain no per-line suggestion schema and never ask for this shape.
    if (Array.isArray(value.changes)) return reply;
    if (value.type !== 'native_tool_calls' || !Array.isArray(value.tool_calls)) throw Error('F6_WRITER_PROTOCOL_INVALID');
    const calls = value.tool_calls as NativeToolCall[];
    messages.push({ role: 'assistant', content: String(value.content || ''), tool_calls: calls });
    let body: string | undefined, receipt: string | undefined;
    for (const request of calls) {
      const args = parse(request.function.arguments);
      let result: Record<string, unknown>;
      if (request.function.name === 'read_file') {
        if (typeof args.file !== 'string' || !Object.hasOwn(accepted.resources, args.file)) throw Error('F6_READ_OUTSIDE_CATALOGUE');
        const id = args.file as Id;
        readIds.push(id); onRead([id]);
        result = { file: id, text: accepted.resources[id], personalFacts: false };
      } else if (request.function.name === 'write_output') {
        if (!Array.isArray(args.files) || !args.files.length || args.files.length > 2) throw Error('F6_WRITE_OUTSIDE_SCOPE');
        const names = new Set<string>();
        for (const file of args.files) {
          if (!file || !['resume-new.md', 'notes.md'].includes(file.name) || names.has(file.name)
            || typeof file.text !== 'string' || !file.text.trim() || file.text.length > 30_000) throw Error('F6_WRITE_OUTSIDE_SCOPE');
          names.add(file.name);
          if (file.name === 'resume-new.md') body = file.text.trim();
          else receipt = file.text.trim();
        }
        const issues=body?verify(body):[];
        result = issues.length
          ? {saved:[],applied:false,issues,
            instruction:'程序未接收这版。对照原稿核实并修正，交回完整新稿；诊断不提供新的经历事实。'}
          : { saved: [...names], applied: false, requiresReviewAndUserConfirmation: true };
        if(issues.length)body=undefined;
      } else throw Error('F6_UNKNOWN_TOOL');
      messages.push({ role: 'tool', tool_call_id: request.id, content: JSON.stringify(result) });
    }
    if (body) return deliver(body, receipt);
  }
  throw Error('F6_AUTHOR_CALL_BUDGET_EXHAUSTED');

  function deliver(body: string, receipt?: string) {
    if (!body.trim() || body.length > 30_000) throw Error('F6_WRITE_OUTSIDE_SCOPE');
    const changes = projectF6Document(input.resume, body).map(change => ({
      ...change, section: input.scope === 'single' ? '经历整体重写' : '整稿选材与重构',
      reason: 'F6 作者交付完整重写稿，宿主生成原位差异供确认；程序接收不等于独立语义审稿通过。',
      sourceIds: input.facts.filter(fact => change.before.includes(fact.text) || fact.text.includes(change.before)).map(fact => fact.id),
    }));
    return JSON.stringify({ changes, fullDocument: body, ...(receipt ? { selectionReceipt: receipt } : {}),
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

