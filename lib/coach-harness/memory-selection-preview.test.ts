import { createContextMemory, type MemorySnapshot } from './context-memory';
import { createResumeMemoryCapabilities } from './resume-memory-capabilities';
import { createInMemorySemanticStore, emptySemanticState } from './semantic-memory';
import { memorySelectionPreview, memoryEvidenceRanges } from './memory-selection-preview';
import { contributionSelectionInstruction, MEMORY_SELECTION_BRIEF } from './memory-selection-brief';

const source = { id: 'source:example', ownerId: 'owner', opportunityId: null, kind: 'history' as const,
  title: '一次贡献', text: '我发现用户要求没进入编辑输入，因此与开发协作修正资料封包；没有负责模型训练，也没有已验证的收益。',
  revision: 'r1', status: 'active' as const, trust: 'user' as const, canSupportFact: false, sourceIds: [] };
const snapshot: MemorySnapshot = { ownerId: 'owner', opportunityId: null, documents: [source], complete: true, limitations: [] };
const core = { instruction: '准备资料', resume: '项目A', jd: null,
  boundary: { version: 'B05', text: '保持事实边界' }, model: 'deepseek-v4-flash' };

test('优先展示中段具体干预而非固定首尾；片段仍逐字回指，预算不扩大', () => {
  const text = '背景说明'.repeat(30) + '。修复列表计数，区分缺证据与未做测试，归并判定并保留否决。' + '结尾限制'.repeat(30) + '。';
  const ranges = memoryEvidenceRanges(text, '判定修复');
  expect(ranges.reduce((n, [a, b]) => n + b - a, 0)).toBeLessThanOrEqual(96);
  expect(ranges.map(([a, b]) => text.slice(a, b)).join('')).toContain('修复列表计数');
  expect(ranges[0][0]).toBeGreaterThan(48);
});

async function setup(preview = true, text = source.text) {
  const scope = { ...snapshot, documents: [{ ...source, text }] };
  const store = createInMemorySemanticStore(emptySemanticState('owner', null));
  const capabilities = createResumeMemoryCapabilities({ snapshot: async () => scope, store,
    organizationMode: 'extractive', selectionEvidencePreview: preview,
    maxBlocks: 20, maxStoredCharacters: 100000, maxSearchCalls: 0,
    maxSearchResults: 1, maxSearchResultCharacters: 1000, publicTopics: [] });
  const memory = createContextMemory({ snapshot: scope, core, capabilities,
    maxContextTokens: 30000, maxToolCalls: 20 });
  await memory.executeAsync('memory.organize', { blocks: [{ category: '贡献', sourceIds: [source.id] }] }, new AbortController().signal);
  return { scope, store, memory, capabilities };
}

test('短预览逐字回指原文，不生成贡献结论，不提前装入或变事实', async () => {
  const { memory, store } = await setup();
  const result = await memory.executeAsync('memory.find', { query: '编辑', limit: 5 }, new AbortController().signal);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error);
  const preview = (result.data.matches as Array<Record<string, unknown>>)[0].selectionEvidence as ReturnType<typeof memorySelectionPreview>;
  expect(preview.previewOnly).toBe(true);
  expect(preview.sourceId).toBe(source.id);
  expect(preview.excerpts.map(e => e.quote).join('')).toBe(source.text);
  expect(memory.inspect().loadedIds).toEqual([]);
  expect(memory.inspect().admittedFactIds).toEqual([]);
  expect((await store.read()).blocks[0].summary).toBe(source.text);
});

test('长证据最多96字符，起止位置准确；不靠展开全库替代自主选择', async () => {
  const text = source.text + '中间细节'.repeat(100) + '结尾仍未核验成本收益。';
  const { memory } = await setup(true, text);
  const r = await memory.executeAsync('memory.find', { query: '编辑', limit: 5 }, new AbortController().signal);
  if (!r.ok) throw Error(r.error);
  const p = (r.data.matches as Array<Record<string, unknown>>)[0].selectionEvidence as ReturnType<typeof memorySelectionPreview>;
  expect(p.excerpts.reduce((n, e) => n + e.quote.length, 0)).toBe(96);
  for (const e of p.excerpts) expect(e.quote).toBe(text.slice(e.start, e.end));
  expect(p.partial).toBe(true);
});

test('唯一变量为候选预览；工具菜单、排序与存储完全相同', async () => {
  const a = await setup(false), b = await setup(true);
  expect(a.capabilities.tools).toEqual(b.capabilities.tools);
  expect(await a.store.read()).toEqual(await b.store.read());
  const search = async (memory: typeof a.memory) => {
    const result = await memory.executeAsync('memory.find', { query: '编辑', limit: 5 }, new AbortController().signal);
    if (!result.ok) throw Error(result.error);
    return result.data;
  };
  const old = await search(a.memory), next = await search(b.memory);
  const stripped = { ...next, matches: (next.matches as Array<Record<string, unknown>>).map(({ selectionEvidence, ...m }) => {
    expect(selectionEvidence).toBeDefined(); return m;
  }) };
  expect(stripped).toEqual(old);
});

test('选材职责保留原编辑任务，不指定某资料或固定工序、不会改写B05', () => {
  const request = '保留本人时间与数字前提，重新组织项目经历。';
  const instruction = contributionSelectionInstruction(request);
  expect(instruction).toBe('为后续原编辑准备已有证据，不写简历。原编辑任务：' + request + '\n' + MEMORY_SELECTION_BRIEF);
  expect(instruction).toContain('不是所有资料都要用');
  expect(instruction).toContain('具体发生了什么问题');
  expect(instruction).not.toContain('owned-');
  expect(instruction).not.toContain('semantic:');
});

test('新会话按Agent明确ID直接load可完整读入，不依赖额外recall注册，也不加载其他资料', async () => {
  const { scope, store, capabilities } = await setup();
  const b = (await store.read()).blocks[0];
  const fresh = createContextMemory({ snapshot: scope, core, capabilities,
    maxContextTokens: 30000, maxToolCalls: 20, allowedTools: ['context.load'] });
  expect(await fresh.executeAsync('context.load', { id:b.id, revision:b.revision }, new AbortController().signal))
    .toMatchObject({ok:true,data:{loadedId:b.id}});
  expect(fresh.inspect().loadedIds).toEqual([b.id]);
  expect(fresh.inspect().admittedFactIds).toEqual([]);
  expect(fresh.messages()[1].content).toContain(source.text);
});

test('持久化load仍检查版本/权限/预算/取消；失败不把资料装入', async () => {
  const { scope, store, capabilities } = await setup();
  const b=(await store.read()).blocks[0], call = new AbortController();
  const fresh=()=>createContextMemory({snapshot:scope,core,capabilities,maxContextTokens:30000,maxToolCalls:5});
  const a=fresh();
  expect(await a.executeAsync('context.load',{id:b.id,revision:'wrong'},call.signal))
    .toEqual({ok:false,error:'MEMORY_REVISION_CHANGED'});
  expect(a.inspect().loadedIds).toEqual([]);
  const denied=createContextMemory({snapshot:scope,core,capabilities,maxContextTokens:30000,maxToolCalls:5,allowedTools:['context.inspect']});
  expect(await denied.executeAsync('context.load',{id:b.id,revision:b.revision},call.signal))
    .toEqual({ok:false,error:'TOOL_NOT_AVAILABLE'});
  const stopped=fresh();call.abort();
  expect(await stopped.executeAsync('context.load',{id:b.id,revision:b.revision},call.signal))
    .toEqual({ok:false,error:'TOOL_DEADLINE_EXCEEDED'});
  expect(stopped.inspect().loadedIds).toEqual([]);
  const injected=fresh();
  expect(await injected.executeAsync('context.load',{id:b.id,revision:b.revision,ownerId:'other'},new AbortController().signal))
    .toEqual({ok:false,error:'UNKNOWN_ARGUMENT'});
});

test.each(['owner', 'revision', 'quote', 'external', 'withdrawn'])('来源不合法时拒绝预览：%s', async mode => {
  const { store } = await setup();
  const block = (await store.read()).blocks[0];
  const invalid = structuredClone(snapshot);
  if (mode === 'owner') invalid.documents[0].ownerId = 'other';
  if (mode === 'revision') invalid.documents[0].revision = 'r2';
  if (mode === 'quote') invalid.documents[0].text = '不含旧证据';
  if (mode === 'external') invalid.documents[0].trust = 'external';
  if (mode === 'withdrawn') invalid.documents[0].status = 'withdrawn';
  expect(() => memorySelectionPreview(block, invalid, '编辑')).toThrow('MEMORY_PREVIEW_EVIDENCE_UNAVAILABLE');
});
