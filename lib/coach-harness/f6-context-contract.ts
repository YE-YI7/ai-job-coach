import type {ResumeEditingContext} from './resume-editing-context';
import type {F6ContextTools} from './f6-context-tools';

export const F6_CONTEXT_TOOL_NAMES = ['knowledge_search', 'knowledge_read', 'memory_search', 'memory_read', 'get_current_time'];

/** Candidate-only server switch, bound to the isolated QA account/budget.
 * No request body can enable this experiment or choose another account. */
export function f6ContextTrialEnabled(userId: string) {
  return process.env.F6_QA_CONTEXT_TOOLS === 'v1' && process.env.F6_QA_USER_ID === userId
    && Boolean(process.env.F6_QA_BUDGET_ID);
}
/** Represent repeated source bytes by a reference, not by another copy.
 * The full original remains available through the existing read_file tool. */
export function f6ContextPayload(payload: Record<string, unknown>, originalResume: string,
  editingContext?: ResumeEditingContext, tools?: F6ContextTools) {
  const current = String(payload['resume.md'] || originalResume);
  const {['facts.md']: rawFacts, source_reference_only: _source,
    public_hiring_case_notes: _cases, optional_read_file_examples: _examples, ...rest} = payload;
  void _source; void _cases; void _examples;
  const supplied = Array.isArray(rawFacts) ? rawFacts as Array<{id: string; text: string}> : [];
  const complete = tools?.snapshot?.complete === true;
  const personalMaterials = uniqueAdditionalFacts([
    ...supplied, ...(complete ? tools!.snapshot!.documents : []),
  ], originalResume, current);
  return {...rest, personalMaterials, contextAccess: {
    originalResume: {file: 'original-resume.md', ...(current === originalResume ? {sameAs: 'resume.md'} : {})},
    personalMemory: complete ? {preloaded: true, complete: true, items: personalMaterials.length}
      : {search: 'memory_search', read: 'memory_read', preloaded: false, complete: false},
    publicKnowledge: {search: 'knowledge_search', read: 'knowledge_read', preloadedMethodBodies: false},
  }, ...(editingContext?.instructionHistory.length ? {
    source_reference_only: {instructionHistory: editingContext.instructionHistory},
  } : {})};
}

export function uniqueAdditionalFacts(facts: Array<{id: string; text: string}>, original: string, current: string) {
  const seen = new Set<string>();
  return facts.filter(fact => {
    const text = fact.text.trim();
    if (!text || seen.has(text) || original.includes(text) || current.includes(text)) return false;
    seen.add(text);
    return true;
  });
}

export function f6ContextSpecification(specification: string) {
  void specification; // Historical source remains frozen, not patched in place.
  return `# 简历改稿写法参考
本次目标、授权范围与事实边界以system为准。本文解释做法，不另加任务或输出物。

## 选材
从岗位需要的能力出发，找出材料里最能证明这种能力的事。背景和问题只写到读者能理解本人判断，动作写到能区分本人与团队，验证保留范围和指标口径。次数、工具名和实验数量不是天然的成果。
同一贡献的发现、判断、干预、验证可以合在一条中；几条共同表达同一能力时考虑合并。没有证据的原因不要通过“据此”“而不是”补出来。

## 表达
用尽可能少的语言交代业务目标和本人贡献，让标题与正文共同承载信息。按重要性分配篇幅，不追求每条等长或每条有数字。删除弱过程细节仍应保持责任与结果真实；涉及跨项目大幅删减等尚待用户决定的取舍，先说明影响并与用户确认。

## 补问
先识别当前表述缺少哪段能体现能力的证据，再问用户可以回忆的真实事件。回忆线索或教学情形用来帮助辨认，不是现成经历。补问只服务于有价值的缺口，不阻断其他已有依据的修改。

## 资料与交付
实际工具名称、参数、保存字段以本次工具列表为准；不预设调用顺序。方法和案例只有knowledge入口，案例不是用户事实。个人材料以本次personalMaterials及按需Memory的来源记录为准。交稿字段由write_output定义；保存与PDF渲染分别看实际回执。`;
}
