import {runEvidenceComparison, evidenceSource} from './resume-evidence-runtime';
import type {EvalSpan} from './eval-scope';
import type {MemorySnapshot} from './context-memory';
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
  contributionReview: {status: 'passed', summary: '具体贡献已经表达', findings: []}};
const usage = {provider: 'tokendance', model: 'deepseek-v4-flash', inputTokens: 10, outputTokens: 10,
  cacheHitTokens: 0, estimatedCostUsd: 0.001, pricingVersion: 'fixture', retryCount: 0};
function setup(arm: 'with_memory' | 'without_memory') {
  const spans: EvalSpan[] = [], inputs: Array<{phase: string; messages: Array<{role: string; content: string}>}> = [];
  const responses: unknown[] = [];
  return {responses, inputs, spans, input: {source, arm, runId: 'run', spans, checkpoint: async () => undefined,
    invoke: async (messages: Array<{role: 'system'|'user'|'assistant'; content: string}>, phase: 'edit'|'review') => {
      inputs.push({phase, messages}); return {text: JSON.stringify(responses.shift()), usage};
    }}};
}
test('无Memory臂不传私有资料/不提供工具，编辑与质检拿到同一事实', async () => {
  const f = setup('without_memory'); f.responses.push(draft, pass);
  const before = JSON.stringify(source);
  const result = await runEvidenceComparison(f.input);
  expect(result.status).toBe('completed'); expect(result.loadedFacts).toEqual([]); expect(result.calls).toBe(2);
  const edit = JSON.parse(f.inputs[0].messages[1].content), review = JSON.parse(f.inputs[1].messages[1].content);
  expect(edit.facts).toBe('[resume-line-1] 原料'); expect(review.facts).toBe(edit.facts);
  expect(JSON.parse(f.inputs[0].messages.at(-1)!.content).availableTools).toEqual([]);
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
test('选材职责由system明确授权，不让普通数据字段冒充指令；缺决定时返回原编辑补齐', async () => {
  const f = setup('with_memory');
  f.responses.push(draft, {...draft, memoryDecision: {choice: 'none', reason: '当前facts已足够，不新增事实'}}, pass);
  const result = await runEvidenceComparison(f.input);
  expect(f.inputs[0].messages.some(m => m.role === 'system' && m.content.includes('本人项目资料的可选索引'))).toBe(true);
  expect(JSON.parse(f.inputs[0].messages.at(-1)!.content).memorySelectionInstruction).toBeUndefined();
  expect(JSON.parse(f.inputs[1].messages[1].content).feedback[0].code).toBe('MEMORY_DECISION_MISSING');
  expect(result.experimentValidity?.activated).toBe(false); expect(result.calls).toBe(3);
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
