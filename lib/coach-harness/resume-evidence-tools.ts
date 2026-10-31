import type {NativeTool} from '@/lib/llm-tools';

const text = {type: 'string', minLength: 1};
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({type: 'object', properties, required, additionalProperties: false});
const list = (items: unknown, maxItems = 12) => ({type: 'array', items, maxItems});
export const EVIDENCE_NATIVE_NAMES: Record<string, string> = {
  memory_catalog: 'memory.catalog', memory_find: 'memory.find', memory_recall: 'memory.recall',
  context_load: 'context.load', context_release: 'context.release', context_inspect: 'context.inspect',
};
export const factBlocks = (facts: string) => [...facts.matchAll(/^\[([^\]\n]+)\] ([\s\S]*?)(?=\n\[[^\]\n]+\] |$)/gm)]
  .map(m => ({id: m[1], text: m[2]}));
const tool = (name: string, description: string, parameters: Record<string, unknown>): NativeTool =>
  ({type: 'function', function: {name, description, parameters}});
const evidenceSchema = (facts: string) => object({sourceId: {type: 'string', enum: factBlocks(facts).map(b => b.id)},
  quote: {type: 'string', minLength: 4, maxLength: 260}});

export function evidenceEditorTools(input: {facts: string; memoryEnabled: boolean; loaded: boolean;
  index: Array<{id: string; revision: string}>; citationRepairOnly?: boolean}) {
  if (input.citationRepairOnly) return [tool('repair_evidence',
    '只修上次候选编辑计划中的来源编号与连续原文引用；正文、取舍与其他字段均冻结，不重新写整稿。',
    object({repairs: list(object({decisionIndex: {type: 'integer', minimum: 0, maximum: 8},
      evidence: list(evidenceSchema(input.facts), 8)}), 8)}))];
  const decision = object({topic: text, retain: text, change: text,
    evidence: list(evidenceSchema(input.facts), 8)}, ['topic', 'retain', 'change']);
  const properties: Record<string, unknown> = {
    editorialPlan: object({mainline: text, decisions: list(decision, 8), ambiguities: list(text, 8)}),
    changes: {...list(object({target: {type: 'string', enum: ['whole_project_source']}, after: text,
      reason: text, sourceIds: {...list({type: 'string', enum: factBlocks(input.facts).map(b => b.id)}, 32), minItems: 1}}), 1), minItems: 1},
    recovery: {anyOf: [{type: 'null'}, object({sourceExcerpt: {type: 'string', minLength: 12, maxLength: 260},
      field: {type: 'string', enum: ['context', 'action', 'deliverable', 'outcome', 'scope']}, question: text})]},
  };
  if (input.memoryEnabled) properties.memoryDecision = object({choice: {type: 'string', enum: [input.loaded ? 'used' : 'none']},
    reason: text});
  const finish = tool('submit_edit', '提交本轮有事实依据的完整候选给原产品质检，不会保存或覆盖用户简历。'
    + '若已有资料只有工具名而缺本人判断/实际改动，可先自主调用Memory工具；不需要可说明none直接交稿。', object(properties));
  if (!input.memoryEnabled) return [finish];
  const ref = {id: {type: 'string', enum: input.index.map(b => b.id)}, revision: text};
  return [
    tool('memory_catalog', '列出私有项目资料类别；不是读取正文。', object({})),
    tool('memory_find', '按当前具体问题、判断或修复动作搜索全部有效资料；返回索引，不代表已加载。',
      object({query: text, limit: {type: 'integer', minimum: 1, maximum: 20}}, ['query'])),
    tool('memory_recall', '按目录ID/版本回读一块的原文与证据；要用于正文请再context_load。', object(ref)),
    tool('context_load', '按目录ID/版本完整读入本人项目事实，供下一次编辑及同次质检使用。'
      + '可直接选目录，无须先搜索；可一次调用多次读不同块，不要求全选。', object(ref)),
    tool('context_release', '释放不再需要的已读块，不删除存储或用户原话。', object({id: text})),
    tool('context_inspect', '检查已读块、上下文预算和实际加载状态。', object({})), finish,
  ];
}

/** An actionable error identifies the exact failed quote; it never silently relinks it or loads unseen material. */
export function citationIssues(plan: unknown, facts: string) {
  const blocks = new Map(factBlocks(facts).map(b => [b.id, b.text]));
  const decisions = (plan as {decisions?: Array<{evidence?: unknown}>})?.decisions;
  return (Array.isArray(decisions) ? decisions : []).flatMap((d, decisionIndex) => {
    if (d.evidence === undefined) return [];
    if (!Array.isArray(d.evidence)) return [{decisionIndex, code: 'INVALID_PLAN_EVIDENCE'}];
    return d.evidence.flatMap(e => typeof e?.sourceId === 'string' && typeof e.quote === 'string'
      && e.quote.length >= 4 && e.quote.length <= 260 && blocks.get(e.sourceId)?.includes(e.quote) ? [] : [{
        decisionIndex, code: 'PLAN_EVIDENCE_NOT_IN_INPUT', claimedSourceId: e?.sourceId ?? null,
        claimedQuote: e?.quote ?? null, actualSourceText: blocks.get(e?.sourceId) ?? null,
      }]);
  });
}

export function applyCitationRepair(candidate: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = structuredClone(candidate);
  const decisions = (next.editorialPlan as {decisions: Array<{evidence?: unknown}>}).decisions;
  if (!Array.isArray(patch.repairs) || !patch.repairs.length || patch.repairs.length > 8) throw Error('EVIDENCE_REPAIR_INVALID');
  const seen = new Set<number>();
  for (const p of patch.repairs as Array<{decisionIndex: number; evidence: unknown}>) {
    if (!Number.isSafeInteger(p.decisionIndex) || !decisions[p.decisionIndex] || seen.has(p.decisionIndex)
      || !Array.isArray(p.evidence) || p.evidence.length > 8) throw Error('EVIDENCE_REPAIR_INVALID');
    seen.add(p.decisionIndex); decisions[p.decisionIndex].evidence = p.evidence;
  }
  return next;
}

export const NATIVE_EDIT_INSTRUCTION = `使用本次API注册的函数，按任务自主选取工具及顺序，不在正文模拟工具调用。
需要私人项目资料就context_load，结果会以原tool_call_id回传，实际facts也会更新；未读索引不是事实。
候选只用submit_edit提交，结构按函数schema；不另输出JSON正文。原稿和已读facts可大胆重构，B05边界不变。
无须资料时可明确none直接提交，不强制取材；未读不能说已用Memory。协议补齐不得重写整稿冒充内容返修。`;
