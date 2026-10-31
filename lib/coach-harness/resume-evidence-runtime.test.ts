import {runEvidenceComparison, evidenceSource} from './resume-evidence-runtime';
import type {EvalSpan} from './eval-scope';
import type {MemorySnapshot} from './context-memory';
import type {LlmMessage, NativeTool} from '@/lib/llm-tools';
const snapshot: MemorySnapshot = {ownerId: 'owner', opportunityId: null, complete: true, limitations: [], documents: [{
  id: 'owned-one', ownerId: 'owner', opportunityId: null, kind: 'claim', title: '输入封包修复',
  text: '与开发协作修复输入封包；没有负责训练。', revision: 'r1', status: 'active', trust: 'user', canSupportFact: false, sourceIds: []}]};
const payload = {source: '原料', facts: '[owned-one] 不得未经装载使用\n[resume-line-1] 原料', knowledge: '同一写法参考', feedback: [],
  contract: {request: '重写项目贡献'}};
const source = {edit: [{role: 'system' as const, content: 'B05冻结'}, {role: 'user' as const, content: JSON.stringify(payload)}],
  review: [{role: 'system' as const, content: '只审不改'}, {role: 'user' as const, content: JSON.stringify({appliedCandidate: '旧稿', facts: payload.facts})}],
  payload, index: 1, rawFacts: '[resume-line-1] 原料', snapshot, boundary: 'B05冻结', sourceHash: 's', knowledgeHash: 'k', boundaryHash: 'b', categories: {}};
const draft = {editorialPlan: {decisions: [{change: '重构贡献'}]}, changes: [{target: 'whole_project_source', after: '改后稿', sourceIds: ['resume-line-1']}]};
const pass = {status: 'passed', summary: '逐条检查有据', findings: [],
  valueChecks: [{index: 0, useful: true, kind: 'specificity', impact: 'content', reason: '写明具体判断与改动的依据'}],
  document: {status: 'passed', summary: '整稿一致', findings: []}, requestCoverage: {status: 'complete', summary: '已完成本轮具体改稿目标', unaddressed: []},
  contributionReview: {status: 'passed', summary: '具体贡献已经表达', findings: []}, groundingEvidence: []};
const usage = {provider: 'tokendance', model: 'deepseek-v4-flash', inputTokens: 10, outputTokens: 10,
  cacheHitTokens: 0, estimatedCostUsd: 0.001, pricingVersion: 'fixture', retryCount: 0};
function setup(arm: 'with_memory' | 'without_memory') {
  const spans: EvalSpan[] = [], inputs: Array<{phase: string; messages: LlmMessage[]; tools?: NativeTool[]}> = [];
  const responses: unknown[] = [];
  return {responses, inputs, spans, input: {source, arm, runId: 'run', spans, checkpoint: async () => undefined,
    invoke: async (messages: LlmMessage[], phase: 'edit'|'review', _count: number, tools?: NativeTool[]) => {
      inputs.push({phase, messages, tools}); return {text: JSON.stringify(responses.shift()), usage};
    }}};
}
test('无Memory臂不传私有资料/不提供工具，编辑与质检拿到同一事实', async () => {
  const f = setup('without_memory'); f.responses.push(draft, pass);
  const before = JSON.stringify(source);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.loadedFacts).toEqual([]); expect(result.calls).toBe(2);
  const edit = JSON.parse(f.inputs[0].messages[1].content), review = JSON.parse(f.inputs[1].messages[1].content);
  expect(edit.facts).toBe('[resume-line-1] 原料'); expect(review.facts).toBe(edit.facts);
  expect(review.editingRequest).toBe(edit.contract.request);
  expect(f.inputs[0].tools?.map(t => t.function.name)).toEqual(['submit_edit']);
  expect(JSON.parse(f.inputs[0].messages.at(-1)!.content).availableMemoryIndex).toBeUndefined();
  expect(JSON.stringify(source)).toBe(before);
});
test('同一编辑可以自主查库再load，不强制ready工序；只装载所选内容，编辑与审稿一致', async () => {
  const f = setup('with_memory');
  f.input.invoke = async (messages, phase) => {
    f.inputs.push({messages, phase});
    const toolContext = phase === 'edit' ? JSON.parse(messages.at(-1)!.content) : null;
    const facts = phase === 'edit' ? JSON.parse(messages[1].content).facts : null;
    let output: unknown;
    if (phase === 'review') output = pass;
    else if (facts.includes('[owned-one]')) output = draft;
    else if (toolContext.toolResults.length) {
      const match = toolContext.toolResults[0].result.data.matches[0];
      output = {type: 'actions', purpose: '取回具体修复原文', actions: [{name: 'context.load', args: {id: match.id, revision: match.revision}}]};
    } else output = {type: 'actions', purpose: '寻找真实干预证据', actions: [{name: 'memory.find', args: {query: '修复', limit: 5}}]};
    return {text: JSON.stringify(output), usage};
  };
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.calls).toBe(4);
  expect(result.loadedFacts).toEqual([{id: 'owned-one', text: snapshot.documents[0].text}]);
  expect(JSON.parse(f.inputs[0].messages.at(-1)!.content).availableMemoryIndex).toEqual([
    expect.objectContaining({title: snapshot.documents[0].title, previewOnly: true})]);
  expect(JSON.parse(f.inputs.at(-1)!.messages[1].content).facts).toContain(snapshot.documents[0].text);
  expect(f.spans[0].agent).toBe('记忆选材接续'); expect(f.spans[2].agent).toBe('改稿 Agent');
});
test('贡献未通过退回原编辑，复检通过才completed；不调用另一个改稿模型', async () => {
  const f = setup('without_memory');
  f.responses.push(draft, {...pass, contributionReview: {status: 'failed', summary: '仍然泛泛', findings: ['具体改动未写']}},
    {...draft, changes: [{...draft.changes[0], after: '返修稿'}]}, pass);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.repairRound).toBe(1);
  expect(f.inputs.map(i => i.phase)).toEqual(['edit', 'review', 'edit', 'review']);
  expect(JSON.parse(f.inputs[2].messages[1].content).feedback[0].contributionReview.status).toBe('failed');
  expect(f.inputs[2].messages[0].content).toBe('B05冻结');
});
test('可自主不取Memory，但不能拿质检passed冒充有效有Memory对照', async () => {
  const f = setup('with_memory'); f.responses.push({...draft, memoryDecision: {choice: 'none', reason: '现有事实已说明本轮要保留的贡献'}}, pass);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('failed'); expect(result.review?.status).toBe('passed');
  expect(result.loadedFacts).toEqual([]); expect(result.experimentValidity?.activated).toBe(false);
});
test('缺说明不再反复重出整稿；无实际读取明确标未激活，不能编造Memory已使用', async () => {
  const f = setup('with_memory');
  f.responses.push(draft, pass);
  const result = await runEvidenceComparison(f.input);
  expect(f.inputs[0].messages.some(m => m.role === 'system' && m.content.includes('本人项目资料的可选索引'))).toBe(true);
  expect(JSON.parse(f.inputs[0].messages.at(-1)!.content).memorySelectionInstruction).toBeUndefined();
  expect(f.inputs.map(i => i.phase)).toEqual(['edit', 'review']);
  expect(result.experimentValidity?.activated).toBe(false); expect(result.calls).toBe(2);
});
test('原生工具真实注册，按同tool_call_id回传，再装入所选facts；不是文本菜单模拟', async () => {
  const f = setup('with_memory');
  let n = 0;
  f.input.invoke = async (messages, phase, _count, tools) => {
    f.inputs.push({messages, phase, tools});
    if (phase === 'review') return {text: JSON.stringify(pass), usage};
    const index = JSON.parse(messages.find(m => m.role === 'user' && m.content.includes('availableMemoryIndex'))!.content).availableMemoryIndex;
    if (n++ === 0) {
      expect(tools?.some(t => t.function.name === 'context_load')).toBe(true);
      return {text: JSON.stringify({type: 'native_tool_calls', tool_calls: [{id: 'native-read-1', type: 'function',
        function: {name: 'context_load', arguments: JSON.stringify({id: index[0].id, revision: index[0].revision})}}]}), usage};
    }
    expect(messages.find(m => m.role === 'tool' && m.tool_call_id === 'native-read-1')).toBeDefined();
    expect(JSON.parse(messages[1].content).facts).toContain(snapshot.documents[0].text);
    return {text: JSON.stringify({type: 'native_tool_calls', tool_calls: [{id: 'native-submit-1', type: 'function',
      function: {name: 'submit_edit', arguments: JSON.stringify(draft)}}]}), usage};
  };
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.calls).toBe(3);
  expect(result.loadedFacts).toHaveLength(1);
  expect(f.spans[0].input).toHaveProperty('nativeTools');
});
test('错误引文只返修引用，正文冻结；修后引用仍非法绝不放行', async () => {
  const invalid = {...draft, editorialPlan: {decisions: [{evidence: [{sourceId: 'resume-line-1', quote: '不存在的引文'}]}]}};
  const f = setup('without_memory');
  f.responses.push(invalid, {repairs: [{decisionIndex: 0, evidence: [{sourceId: 'resume-line-1', quote: '原料'}]}]}, pass);
  // Quotes shorter than four characters are also invalid; repair must not relax the contract.
  await expect(runEvidenceComparison(f.input)).rejects.toThrow('EDITOR_EVIDENCE_INVALID');
  expect(f.inputs[1].tools?.[0].function.name).toBe('repair_evidence');
  expect(f.inputs.some(i => i.phase === 'review')).toBe(false);
});
test('错误引文经原编辑最小修复后才审核，正文未被协议纠正改写', async () => {
  const f = setup('without_memory');
  f.input.source = {...source, rawFacts: '[resume-line-1] 原材料真实贡献'};
  f.responses.push({...draft, editorialPlan: {decisions: [{evidence: [{sourceId: 'resume-line-1', quote: '错误的四个字'}]}]}},
    {repairs: [{decisionIndex: 0, evidence: [{sourceId: 'resume-line-1', quote: '真实贡献'}]}]}, pass);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.draft?.changes).toEqual(draft.changes);
  expect(f.inputs.map(i => i.phase)).toEqual(['edit', 'edit', 'review']);
});
test('质检无证据先返同质检补证，不退回编辑破坏稿件或默认通过', async () => {
  const f = setup('without_memory');
  f.responses.push(draft, {...pass, groundingEvidence: undefined}, pass);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed');
  expect(f.inputs.map(i => i.phase)).toEqual(['edit', 'review', 'review']);
  const reviewed = f.inputs.filter(i => i.phase === 'review').map(i => JSON.parse(i.messages[1].content).appliedCandidate);
  expect(reviewed[0]).toBe(reviewed[1]);
});
test('伪造引用和未装载引用都不启动质检，无Memory臂不能偷偷调工具', async () => {
  for (const output of [{...draft, changes: [{...draft.changes[0], sourceIds: ['owned-one']}]},
    {type: 'actions', actions: [{name: 'memory.find', args: {query: '修复'}}]}]) {
    const f = setup('without_memory'); f.responses.push(output);
    await expect(runEvidenceComparison(f.input)).rejects.toThrow();
    expect(f.inputs).toHaveLength(1);
  }
});
test('source没有实际编辑/质检或B05不一致时拒绝，不能静默改边界', () => {
  expect(() => evidenceSource({spans: []}, 'owner')).toThrow('SOURCE_EDITOR_OR_REVIEW_MISSING');
  expect(() => evidenceSource({spans: [{agent: '改稿 Agent', input: {messages: source.edit}},
    {agent: '独立质检 Agent', input: {messages: source.review}}] as EvalSpan[]}, 'owner')).toThrow('FROZEN_BOUNDARY_MISMATCH');
});
