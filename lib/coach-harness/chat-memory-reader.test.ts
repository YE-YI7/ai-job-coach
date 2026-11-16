import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {createF6MemoryReader} from './f6-memory-reader';
import {F6ContextTools} from './f6-context-tools';
import {f6ContextPayload} from './f6-context-contract';
import {personalMaterialScope} from './personal-material-scope';
import {runF6ResumeWriter} from './resume-f6-writer';
import {refreshProfileMemory} from './learning-memory';

jest.mock('@/lib/db', () => ({getDbClient: jest.fn()}));
const user = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const otherWorkspace = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const claimId = '55555555-5555-4555-8555-555555555555';
const sourceId = '66666666-6666-4666-8666-666666666666';
const resume = '陈一帆\n产品实习，整理工单、画流程图。';
const question = '我看了120条工单，发现38条是政策边界争议，先转人工；40条回放，错误自动结单7条降到1条。';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const turn = (extra: Record<string, unknown> = {}) => ({id: turnId, user_id: user,
  opportunity_id: workspace, question, created_at: '2026-11-15T00:00:00Z', ...extra});
const claim = (extra: Record<string, unknown> = {}) => ({id: claimId, user_id: user,
  opportunity_id: workspace, display_text: '本人组织过客服验收', source_id: sourceId,
  source_kind: 'user_statement', status: 'unverified', visibility: 'recruiter_safe',
  updated_at: '2026-11-15T00:00:00Z', ...extra});

function database(tables: Record<string, Array<Record<string, unknown>>>, failedTable = '') {
  const queries: Array<{table: string; selection: string; filters: Array<[string, unknown]>; write: unknown}> = [];
  (getDbClient as jest.Mock).mockImplementation(async () => ({from: (table: string) => {
    const entry = {table, selection: '', filters: [] as Array<[string, unknown]>, write: undefined as unknown}; queries.push(entry);
    let start = 0, end = Number.MAX_SAFE_INTEGER;
    const selected = () => (tables[table] || []).filter(row => entry.filters.every(([key, value]) =>
      key === 'or' || key === 'neq' || (Array.isArray(value) ? value.includes(row[key]) : row[key] === value)))
      .filter(row => table !== 'coach_agent_turns' || row.proactive !== true);
    const chain = {
      select: (selection: string) => {entry.selection = selection; return chain;},
      eq: (key: string, value: unknown) => {entry.filters.push([key, value]); return chain;},
      in: (key: string, value: unknown) => {entry.filters.push([key, value]); return chain;},
      or: (value: string) => {entry.filters.push(['or', value]); return chain;},
      neq: (key: string, value: unknown) => {entry.filters.push(['neq', [key, value]]); return chain;},
      order: () => chain, limit: () => chain,
      then: (resolve: (value: {data: Array<Record<string, unknown>>; error: null}) => unknown) =>
        Promise.resolve({data: selected(), error: null}).then(resolve),
      maybeSingle: async () => ({data: selected()[0] || null, error: null}),
      insert: async (row: unknown) => {entry.write = row; return {data: null, error: null};},
      range: (a: number, b: number) => {start = a; end = b; return chain;},
      abortSignal: async () => {
        const rows = selected();
        return {data: rows.slice(start, end + 1), count: rows.length,
          error: table === failedTable ? {message: 'offline'} : null};
      },
    };
    return chain;
  }}));
  return queries;
}
const reader = () => createF6MemoryReader({userId: user, opportunityId: workspace,
  originalResume: resume, currentResume: resume});

test('user chat remains on demand; tutor examples never enter search, read, or evidence', async () => {
  const queries = database({coach_agent_turns: [turn({answer: '导师示例：我独立负责百人部门，营收提升900%'}),
    turn({id: claimId, proactive: true, question: '系统主动事件，不是用户事实'})]});
  const memory = reader(), snapshot = await memory.preload!();
  expect(snapshot).toEqual({complete: false, documents: [], onDemand: {userChatTurns: 1}});
  const tools = new F6ContextTools(memory, undefined, snapshot);
  const payload = f6ContextPayload({'resume.md': resume, 'facts.md': []}, resume, undefined, tools);
  expect(JSON.stringify(payload)).not.toContain(question);
  expect(payload.contextAccess.personalMemory).toEqual({search: 'memory_search', read: 'memory_read',
    preloaded: false, complete: false});
  expect(JSON.stringify(payload)).not.toMatch(/availableSources|userChatTurns/);
  expect(tools.memoryAvailable).toBe(true);
  const result = await tools.invoke('memory_search', {query: '政策 工单 回放'});
  expect((result.matches as Array<{id: string}>).map(row => row.id)).toEqual([turnId]);
  const read = await tools.invoke('memory_read', {ids: [turnId]});
  expect(JSON.stringify(read)).toContain(question);
  expect(JSON.stringify(read)).not.toContain('900%');
  expect(tools.evidence[0]).toMatchObject({id: turnId, status: 'unverified',
    sourceType: 'coach_agent_turns.question', sourceId: turnId});
  for (const q of queries.filter(q => q.table === 'coach_agent_turns')) {
    expect(q.selection).not.toContain('answer');
    expect(q.selection).not.toContain('summary');
    expect(q.filters).toContainEqual(['user_id', user]);
    expect(q.filters).toContainEqual(['opportunity_id', [workspace]]);
  }
});

test('account ownership alone does not authorize another uploaded candidate or their chat', async () => {
  database({coach_claims: [claim({opportunity_id: null}), claim({id: sourceId, opportunity_id: otherWorkspace})],
    coach_agent_turns: [turn({opportunity_id: otherWorkspace}), turn({user_id: sourceId})],
    coach_sources: [{id: sourceId, user_id: user, opportunity_id: otherWorkspace,
      source_type: 'resume', content_hash: sha('另一个候选人的简历')}]});
  const memory = reader();
  expect((await memory.preload!()).documents).toEqual([]);
  expect((await memory.search('工单', 0)).matches).toEqual([]);
  expect((await memory.read([turnId, claimId])).unavailableIds).toEqual([turnId, claimId]);
});

test('an explicitly shared exact resume links past preparation facts across stages without guessing identity', async () => {
  database({coach_sources: [{id: sourceId, user_id: user, opportunity_id: otherWorkspace,
    source_type: 'resume', content_hash: sha(resume)}],
    coach_claims: [claim({opportunity_id: null})], coach_agent_turns: [turn({opportunity_id: otherWorkspace})]});
  const binding = await personalMaterialScope({userId: user, opportunityId: workspace, resumes: [resume]});
  expect(binding.opportunityIds).toEqual([workspace, otherWorkspace]);
  expect(binding.accepts({opportunity_id: null, source_id: sourceId})).toBe(true);
  expect(binding.accepts({opportunity_id: null, source_id: turnId})).toBe(false);
  const memory = reader(), found = await memory.search('工单', 0);
  expect((found.matches as Array<{id: string}>).map(row => row.id)).toContain(turnId);
  expect((await memory.read([turnId])).documents[0].text).toBe(question);
});

test('questions and hypotheses remain attributed raw user speech, not confirmed extracted facts', async () => {
  database({coach_agent_turns: [turn({question: '如果我说自己负责百人团队会不会更好？这只是举例，我没做过。'})]});
  const result = await reader().read([turnId]);
  expect(result.documents[0].status).toBe('unverified');
  expect(result.documents[0].interpretation).toContain('问题、假设或引用');
  expect(result.documents[0].text).toContain('我没做过');
});

test('a removed user turn is unavailable; lookup failures stay errors, not fabricated empty memories', async () => {
  database({coach_agent_turns: []});
  expect((await reader().read([turnId])).unavailableIds).toEqual([turnId]);
  database({}, 'coach_agent_turns');
  await expect(reader().search('工单', 0)).rejects.toThrow('MEMORY_CHAT_SEARCH_FAILED');
  await expect(reader().read(['not-an-id'])).rejects.toThrow('MEMORY_IDS_INVALID');
});

test('zero-fee runtime replay delivers selected user speech to the writer, not merely to Trace', async () => {
  database({coach_agent_turns: [turn({answer: '导师虚构示例：节约900万元'})]});
  const memory = reader(), tools = new F6ContextTools(memory, undefined, await memory.preload!());
  const call = (name: string, args: unknown) => JSON.stringify({type: 'native_tool_calls', content: '',
    tool_calls: [{id: 'call-' + name, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});
  // Stub choices prove transport only; the paid acceptance model chooses its own tools.
  const run = jest.fn()
    .mockResolvedValueOnce(call('memory_search', {query: '工单 判断 验证', purpose: '查此前用户讲过的判断'}))
    .mockResolvedValueOnce(call('memory_read', {ids: [turnId], purpose: '读用户原话核实验证范围'}))
    .mockResolvedValueOnce(call('write_output', {resume_markdown: resume,
      mentor_markdown: '这里先保留离线回放口径。', purpose: '交付现有证据支持的版本'}));
  await runF6ResumeWriter({resume, jd: '', facts: [], request: '', answers: [], decisions: [],
    scope: 'whole', format: {}, mentorCoaching: true, contextTools: tools}, run, jest.fn());
  expect(run).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(run.mock.calls[0][0])).not.toContain(question);
  expect(JSON.stringify(run.mock.calls[2][0])).toContain(question);
  expect(JSON.stringify(run.mock.calls[2][0])).not.toContain('900万元');
  expect(tools.evidence[0].sourceId).toBe(turnId);
});

test('the tutor profile cache cannot reintroduce another candidate behind the scoped reader', async () => {
  const queries = database({coach_opportunities: [{id: workspace, user_id: user, metadata: {resumeText: resume}}],
    coach_claims: [claim(), claim({id: sourceId, opportunity_id: null, display_text: '旧候选人周宁负责销售知识助手'})]});
  const summary = await refreshProfileMemory(user, workspace);
  expect(summary).toContain('本人组织过客服验收');
  expect(summary).not.toContain('旧候选人');
  const written = queries.find(q => q.table === 'coach_memory_documents' && q.write)!.write;
  expect(JSON.stringify(written)).not.toContain('旧候选人');
});
