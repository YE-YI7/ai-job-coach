import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {F6ContextTools, F6_CONTEXT_TOOLS, type F6MemoryDocument} from './f6-context-tools';
import {createF6MemoryReader} from './f6-memory-reader';
import {f6ContextTrialEnabled, uniqueAdditionalFacts} from './f6-context-contract';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {F6ToolSession} from './f6-tool-session';
import {F6HrReviewSession} from './f6-hr-review';
import {resumableKnowledgeDocuments} from '@/lib/knowledge/document-repository';
import * as evalScope from './eval-scope';

jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
const userId = '11111111-1111-4111-8111-111111111111';
const opportunityId = '22222222-2222-4222-8222-222222222222';
const memoryId = '33333333-3333-4333-8333-333333333333';
const resume = '周宁\n求职方向：AI产品经理\n做知识助手，采访8名销售，检查120条问题。';
const extra = '我对比过两版报价，发现旧版条款被当作当前条款引用。';
const document: F6MemoryDocument = {id: memoryId, text: extra, sourceId: 'source',
  sourceKind: 'user_statement', status: 'unverified', updatedAt: '2026-11-12T00:00:00Z',
  verification: 'user_report_not_independently_verified'};
const reader = () => ({search: jest.fn().mockResolvedValue({matches: []}),
  read: jest.fn().mockResolvedValue({documents: [document], unavailableIds: []})});
const input = {resume, jd: '', facts: resume.split('\n').map((text, index) => ({id: 'line-' + index, text})),
  request: '', answers: [], decisions: [], scope: 'whole' as const, format: {}, mentorCoaching: true as const};
const call = (name: string, args: unknown, content = '') => JSON.stringify({type: 'native_tool_calls', content,
  tool_calls: [{id: 'call-' + name, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});
const save = (body: string) => call('write_output', {files: [{name: 'resume-new.md', text: body}]});

beforeEach(() => { jest.clearAllMocks(); });

test('current full resume occurs once; original and numbered copies are references rather than extra input', () => {
  const contextTools = new F6ContextTools(reader());
  const withContext = {...input, contextTools, editingContext: {
    current: {text: resume}, task: {action: 'start', request: '', purpose: '改当前稿'},
    instructionHistory: [], documentRoles: {'resume.md': '当前稿', 'original-resume.md': '核源', instructionHistory: '历史'},
  } as unknown as NonNullable<Parameters<typeof f6InitialMessages>[0]['editingContext']>};
  const messages = f6InitialMessages(withContext), payload = JSON.parse(messages[1].content);
  const encoded = JSON.stringify(resume).slice(1, -1);
  expect(messages[1].content.split(encoded)).toHaveLength(2);
  expect(payload).not.toHaveProperty('facts.md');
  expect(payload).not.toHaveProperty('source_reference_only');
  expect(payload.contextAccess.originalResume.sameAs).toBe('resume.md');
  expect(payload.contextAccess.personalMemory.preloaded).toBe(false);
  expect(messages[0].content).toContain('purpose简短记录选择');
  expect(payload).not.toHaveProperty('public_hiring_case_notes');
  expect(payload).not.toHaveProperty('optional_read_file_examples');
});

test('full distinct original remains readable on demand without appearing in the first request', async () => {
  const original = '原始简历独有完整段落，保留协作责任和试点范围。';
  const contextTools = new F6ContextTools(reader());
  const messages = f6InitialMessages({...input, resume: original, contextTools,
    editingContext: {current: {text: resume}, task: {action: 'restart', request: '', purpose: '改当前稿'},
      instructionHistory: [], documentRoles: {}} as unknown as NonNullable<Parameters<typeof f6InitialMessages>[0]['editingContext']>});
  expect(messages[1].content).not.toContain(original);
  const session = new F6ToolSession({...input, originalResume: original, contextTools}, () => []);
  expect(await session.invoke('read_file', {file: 'original-resume.md'})).toEqual({file: 'original-resume.md', text: original});
  expect(await session.invoke('read_file', {file: 'resume.md'})).not.toHaveProperty('text');
});

test('knowledge directory, full selected text and source URLs are real; unknown IDs do not trigger a fallback', async () => {
  const tools = new F6ContextTools(reader());
  const catalogue = await tools.invoke('knowledge_search', {query: '简历 贡献 取舍 事实 改写'});
  const matches = catalogue.matches as Array<{id: string; content?: string}>;
  expect(matches.some(item => item.id === 'resume.factual-rewriting.v1')).toBe(true);
  expect(matches.every(item => !item.content)).toBe(true);
  const result = await tools.invoke('knowledge_read', {ids: ['resume.factual-rewriting.v1', 'not-active-or-known']});
  const docs = result.documents as Array<{id: string; text: string; sha256: string; sourceUrls: string[]; personalFacts: boolean}>;
  const actual = resumableKnowledgeDocuments().find(item => item.id === docs[0].id)!;
  expect(docs[0].text).toBe(actual.content);
  expect(docs[0].sha256).toBe(createHash('sha256').update(actual.content).digest('hex'));
  expect(docs[0].sourceUrls.length).toBeGreaterThan(0);
  expect(docs[0].personalFacts).toBe(false);
  expect(result.unavailableIds).toEqual(['not-active-or-known']);
  expect(tools.evidence).toEqual([]);
});

test('available tool catalogue is executable, and stale tool names are removed only in the candidate spec', async () => {
  const tools = new F6ContextTools(reader());
  const session = new F6ToolSession({...input, contextTools: tools}, () => [], undefined, undefined, undefined, true);
  const names = session.availableTools().map(tool => tool.function.name);
  expect(names).toEqual(expect.arrayContaining(F6_CONTEXT_TOOLS.map(tool => tool.function.name)));
  for (const tool of session.availableTools()) expect(tool.function.parameters.required).toContain('purpose');
  expect(session.availableTools().find(tool => tool.function.name === 'write_output')!.function.parameters.required)
    .toEqual(['purpose', 'resume_markdown']);
  const spec = await session.invoke('read_file', {file: 'spec.md'});
  expect(spec.text).not.toContain('| memory.find / recall |');
  expect(spec.text).not.toContain('| fact_check |');
  expect(spec.text).not.toContain('../好样本库/');
  expect(spec.text).toContain('不预设调用顺序');
});

test('visible purpose stays local and does not become a search query, fact or an extra model hop', async () => {
  const memory = reader(), contextTools = new F6ContextTools(memory);
  const session = new F6ToolSession({...input, contextTools}, () => []);
  await session.invoke('memory_search', {query: '版本 判断', purpose: '核实当时的判断依据，先找个人补充。'});
  expect(memory.search).toHaveBeenCalledWith('版本 判断', 0);
  expect(contextTools.evidence).toEqual([]);
  expect(await session.invoke('write_output', {files: [{name: 'resume-new.md', text: resume}],
    purpose: '交付已有依据的正文。', context_notes: '个人记忆为空，没有添加经历。'}))
    .toMatchObject({saved: ['resume-new.md']});
  expect(session.outputs.get('resume-new.md')).toBe(resume);
});

test('model can choose an immediate draft: no compulsory planning/search or new call is inserted', async () => {
  const run = jest.fn().mockResolvedValue(save('周宁\nAI产品方向；完成知识助手问题检查。'));
  const result = JSON.parse(await runF6ResumeWriter({...input, contextTools: new F6ContextTools(reader())}, run, jest.fn()));
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toContain('完成知识助手');
});

test('decision notes never shadow the actual tool receipt in the existing Trace lookup', async () => {
  const capture = jest.spyOn(evalScope, 'captureEvalStage');
  try {
    const run = jest.fn().mockResolvedValue(call('write_output', {
      files: [{name: 'resume-new.md', text: resume}], purpose: '交付有据的版本。',
      context_notes: '没有补充历史资料。',
    }));
    await runF6ResumeWriter({...input, contextTools: new F6ContextTools(reader())}, run, jest.fn());
    const decision = capture.mock.calls.find(args => args[1] === 'f6_tool_decision_summary')![2]!;
    expect(decision.input).toEqual({decisionForToolCallId: 'call-write_output', toolName: 'write_output'});
    expect(decision.input).not.toHaveProperty('toolCallId');
    expect(decision.output).toMatchObject({text: '交付有据的版本。'});
    expect(decision.output).not.toHaveProperty('channelDecisions');
    const receipt = capture.mock.calls.find(args => args[1] === 'f6_tool_write_output')![2]!;
    expect(receipt.input).toMatchObject({toolCallId: 'call-write_output'});
    expect(receipt.output).toMatchObject({saved: ['resume-new.md']});
  } finally { capture.mockRestore(); }
});

test('visible decision, actual method result and read personal source reach the following model input', async () => {
  const memory = reader(), contextTools = new F6ContextTools(memory);
  const visible = '需要核实版本混用是怎样发现的，先查这个账号已有的个人补充。';
  const run = jest.fn().mockResolvedValueOnce(call('memory_read', {ids: [memoryId]}, visible))
    .mockResolvedValueOnce(call('knowledge_read', {ids: ['resume.factual-rewriting.v1']}, '原话已说明判断，读改写方法以取舍表达。'))
    .mockResolvedValueOnce(save('周宁\n对比报价版本，发现条款引用错误并整理问题清单。'));
  const onRead = jest.fn();
  await runF6ResumeWriter({...input, contextTools}, run, onRead);
  expect(run).toHaveBeenCalledTimes(3);
  expect(run.mock.calls[1][0]).toContainEqual(expect.objectContaining({role: 'assistant', content: visible}));
  const received = JSON.stringify(run.mock.calls[2][0]);
  expect(received).toContain(extra);
  expect(received).toContain('每条 bullet 讲一件主要贡献');
  expect(onRead).toHaveBeenCalledWith(['resume.factual-rewriting.v1']);
  expect(contextTools.evidence).toEqual([document]);
});

test('HR receives only extra sources actually read, and lookup failures are not invented as memories', async () => {
  const memory = reader(), contextTools = new F6ContextTools(memory);
  const hr = jest.fn().mockResolvedValue('原文支持本人对比版本，但不支持主导模型训练。');
  const review = new F6HrReviewSession({resume, jd: '', get facts() {
    return contextTools.evidence.map(item => item.text).join('\n');
  }}, hr);
  const run = jest.fn().mockResolvedValueOnce(call('memory_read', {ids: [memoryId]}))
    .mockResolvedValueOnce(save('周宁\n对比报价版本并整理问题清单。'))
    .mockResolvedValueOnce(save('周宁\n对比报价版本并整理问题清单。'));
  await runF6ResumeWriter({...input, contextTools}, run, jest.fn(), undefined, undefined, undefined, review);
  expect(hr).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(hr.mock.calls[0][0])).toContain(extra);
  expect(uniqueAdditionalFacts(input.facts, resume, resume)).toEqual([]);
});

function database(rows: Array<Record<string, unknown>>, failure = false) {
  const queries: Array<Array<[string, unknown]>> = [];
  (getDbClient as jest.Mock).mockImplementation(async () => ({from: (table: string) => {
    const operations: Array<[string, unknown]> = [];
    if (table === 'coach_claims') queries.push(operations);
    const chain = {
      select: (...args: unknown[]) => {operations.push(['select', args]); return chain;},
      eq: (key: string, value: unknown) => {operations.push([key, value]); return chain;},
      in: (key: string, value: unknown) => {operations.push([key, value]); return chain;},
      or: (value: string) => {operations.push(['or', value]); return chain;},
      order: () => chain, range: () => chain,
      abortSignal: async () => ({data: table === 'coach_claims' ? rows : [],
        count: table === 'coach_claims' ? rows.length : 0,
        error: failure && table === 'coach_claims' ? {message: 'offline'} : null}),
    };
    return chain;
  }}));
  return queries;
}
const row = (changes: Record<string, unknown> = {}) => ({id: memoryId, user_id: userId, opportunity_id: opportunityId,
  display_text: extra, source_id: 'source', source_kind: 'user_statement', status: 'unverified',
  visibility: 'recruiter_safe', updated_at: '2026-11-12T00:00:00Z', ...changes});
const ownedReader = () => createF6MemoryReader({userId, opportunityId, currentResume: resume, originalResume: resume});

test('preload deduplicates owned facts and only claims complete coverage with a bounded full read', async () => {
  database([row(), row({id: '44444444-4444-4444-8444-444444444444'}), row({display_text: resume})]);
  const pack = await ownedReader().preload!();
  expect(pack.complete).toBe(true);
  expect(pack.documents).toHaveLength(1);
  expect(pack.documents[0]).toMatchObject({text: extra, sourceKind: 'user_statement', status: 'unverified'});
  database([row({display_text: '长'.repeat(65000)})]);
  expect(await ownedReader().preload!()).toEqual({complete: false, documents: []});
  database([], true);
  await expect(ownedReader().preload!()).rejects.toThrow('MEMORY_PRELOAD_FAILED');
});

test('Memory is real server-bound read-only data, not an echo of the current resume or AI output', async () => {
  const queries = database([row(), row({id: 'duplicate', display_text: resume.split('\n')[2]}),
    row({id: 'foreign', user_id: '44444444-4444-4444-8444-444444444444'}),
    row({id: 'withdrawn', status: 'withdrawn'}), row({id: 'ai', source_kind: 'hosted_ai'}),
    row({id: 'private', visibility: 'private'}), row({id: 'other-job', opportunity_id: '55555555-5555-4555-8555-555555555555'})]);
  const memory = ownedReader(), result = await memory.search('版本 判断', 0);
  expect((result.matches as Array<{id: string}>).map(item => item.id)).toEqual([memoryId]);
  expect(result.excludedCurrentResume).toBe(1);
  expect((await memory.read([memoryId])).documents).toEqual([document]);
  for (const query of queries) {
    expect(query).toContainEqual(['user_id', userId]);
    expect(query).toContainEqual(['source_kind', ['user_upload', 'user_statement']]);
    expect(query.some(([name, value]) => name === 'or' && String(value).includes(opportunityId))).toBe(true);
  }
});

test('empty Memory stays empty, revoked items are unavailable, and database failure is an error rather than an empty match', async () => {
  database([]); const empty = await ownedReader().search('项目验证', 0);
  expect(empty.matches).toEqual([]);
  database([row({status: 'withdrawn'})]);
  expect((await ownedReader().read([memoryId])).unavailableIds).toEqual([memoryId]);
  database([], true);
  await expect(ownedReader().search('项目验证', 0)).rejects.toThrow('MEMORY_SEARCH_FAILED');
});

test('candidate cannot be enabled by an ordinary user; the main writing map and normal first request remain unchanged', () => {
  const saved = {...process.env};
  try {
    process.env.F6_QA_CONTEXT_TOOLS = 'v1'; process.env.F6_QA_USER_ID = userId; process.env.F6_QA_BUDGET_ID = 'budget';
    expect(f6ContextTrialEnabled('someone-else')).toBe(false);
    expect(f6ContextTrialEnabled(userId)).toBe(true);
    const plain = f6InitialMessages(input);
    expect(plain[0].content).not.toContain('【资料入口与公开判断】');
    expect(JSON.parse(plain[1].content)['facts.md']).toEqual(input.facts);
  } finally {
    for (const key of ['F6_QA_CONTEXT_TOOLS', 'F6_QA_USER_ID', 'F6_QA_BUDGET_ID']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
