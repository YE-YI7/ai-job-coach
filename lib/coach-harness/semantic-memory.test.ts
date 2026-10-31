import {
  blockIsCurrent, createInMemorySemanticStore, emptySemanticState, prepareOrganization,
  searchSemanticBlocks, semanticDocument, type OrganizeInput,
} from './semantic-memory';
import type { MemorySnapshot } from './context-memory';

const source = {
  id: 'claim:project', ownerId: 'owner', opportunityId: 'job', kind: 'claim' as const,
  title: '用户项目原话', text: '我负责验收标准，不负责模型训练；目标是AI产品经理。',
  revision: 'source-r1', status: 'active' as const, trust: 'user' as const,
  canSupportFact: true, sourceIds: [],
};
const snapshot: MemorySnapshot = {
  ownerId: 'owner', opportunityId: 'job', documents: [source], complete: true, limitations: [],
};
const proposal: OrganizeInput = { blocks: [{
  id: 'semantic:project', category: '项目责任与取舍', object: '项目A', title: '验收责任',
  description: '写项目贡献时看，不能据此声称模型训练经验', summary: '负责验收，不负责训练。',
  aliases: ['验收边界'], evidence: [{ sourceId: source.id, revision: source.revision, quote: '我负责验收标准，不负责模型训练' }],
}, {
  id: 'semantic:goal', category: '职业目标', object: '本次求职', title: 'AI产品经理方向',
  description: '选择简历主线时参考', summary: '目标AI产品经理。',
  evidence: [{ sourceId: source.id, revision: source.revision, quote: '目标是AI产品经理' }],
}] };
const prepare = (override: Partial<Parameters<typeof prepareOrganization>[0]> = {}) => prepareOrganization({
  snapshot, state: emptySemanticState('owner', 'job'), proposal, maxBlocks: 1000, maxStoredCharacters: 1_000_000,
  ...override,
});

test('一段聊天可归入多个语义类别，不将聊天本身当唯一类别', () => {
  const result = prepare();
  expect(result.blocks.map(b => b.category)).toEqual(['项目责任与取舍', '职业目标']);
  expect(result.blocks[0].evidence[0].quote).toContain('不负责模型训练');
  expect(result.blocks.every(b => b.canSupportFact === false)).toBe(true);
  expect(result.metrics.semanticFidelityVerified).toBe(false);
  expect(result.metrics.sourceCharacters).toBe(source.text.length);
  expect(result.metrics.retainedEvidenceCharacters).toBeGreaterThan(0);
});

test('类别由模型给出，不限定现图六类；说明、别名、正文都可搜', () => {
  const result = prepare();
  expect(searchSemanticBlocks(result.next, snapshot, '验收边界', 5).matches[0].block.id).toBe('semantic:project');
  expect(searchSemanticBlocks(result.next, snapshot, '不能据此声称', 5).matches).toHaveLength(1);
  expect(searchSemanticBlocks(result.next, snapshot, '训练', 5).matches).toHaveLength(1);
});

test('不按热度/最近N条提前截断，冷门但相关的老块仍可找到', () => {
  const result = prepare();
  const hot = Array.from({ length: 500 }, (_, i) => ({ ...result.blocks[1], id: `semantic:hot${i}`, title: '热门求职目标' }));
  const state = { ...result.next, blocks: [...hot, result.blocks[0]] };
  expect(searchSemanticBlocks(state, snapshot, '验收标准', 1).matches[0].block.id).toBe('semantic:project');
  expect(searchSemanticBlocks(state, snapshot, '绝不存在的事情', 5).matches).toHaveLength(0);
});

test.each(['foreign-owner', 'foreign-job'])('拒绝跨账号/岗位的证据 %s', mode => {
  const altered = { ...snapshot, documents: [{ ...source,
    ...(mode === 'foreign-owner' ? { ownerId: 'other' } : { opportunityId: 'other' }) }] };
  expect(() => prepare({ snapshot: altered })).toThrow('MEMORY_EVIDENCE_NOT_CURRENT');
});

test.each(['withdrawn', 'stale', 'conflicted'])('撤回/过期/冲突源不能被压缩成有效记忆 %s', status => {
  const altered = { ...snapshot, documents: [{ ...source, status: status as typeof source.status }] };
  expect(() => prepare({ snapshot: altered })).toThrow('MEMORY_EVIDENCE_NOT_CURRENT');
});

test('错误引文或来源版本不匹配时不保存', () => {
  const wrong = structuredClone(proposal);
  wrong.blocks[0].evidence[0].quote = '独立训练大模型';
  expect(() => prepare({ proposal: wrong })).toThrow('MEMORY_EVIDENCE_NOT_CURRENT');
  wrong.blocks[0].evidence[0].quote = proposal.blocks[0].evidence[0].quote;
  wrong.blocks[0].evidence[0].revision = 'old';
  expect(() => prepare({ proposal: wrong })).toThrow('MEMORY_EVIDENCE_NOT_CURRENT');
});

test.each(['derived', 'external', 'public'])('不能把导师/外部内容转成个人记忆源 %s', trust => {
  expect(() => prepare({ snapshot: { ...snapshot, documents: [{ ...source, trust: trust as typeof source.trust }] } }))
    .toThrow('MEMORY_REQUIRES_USER_SOURCE');
});

test('保存派生摘要不自动授予事实资格；取回仍带原文/来源和派生标签', () => {
  const block = prepare().blocks[0];
  const document = semanticDocument(block, snapshot);
  expect(document.canSupportFact).toBe(false);
  expect(document.trust).toBe('derived');
  expect(document.text).toContain('derived_not_confirmed_fact');
  expect(document.text).toContain('不负责模型训练');
});

test('用户修正/撤回原文后，旧摘要不再命中或回读', () => {
  const result = prepare();
  const current = { ...snapshot, documents: [{ ...source, revision: 'r2', text: '修正后的内容' }] };
  expect(blockIsCurrent(result.blocks[0], current)).toBe(false);
  expect(searchSemanticBlocks(result.next, current, '验收', 5).matches).toHaveLength(0);
  expect(() => semanticDocument(result.blocks[0], current)).toThrow('MEMORY_EVIDENCE_NOT_CURRENT');
});

test('合并/拆分/纠正必须带旧版本，保留退役版本不覆盖原文', () => {
  const first = prepare();
  expect(() => prepare({ state: first.next })).toThrow('MEMORY_REPLACE_REQUIRES_REVISION');
  const next = prepare({ state: first.next, proposal: {
    blocks: [{ ...proposal.blocks[0], summary: '更紧凑的责任描述。' }],
    supersedes: [{ id: first.blocks[0].id, revision: first.blocks[0].revision }],
  } });
  expect(next.next.blocks).toHaveLength(3);
  expect(next.next.blocks[0].status).toBe('superseded');
  expect(next.next.blocks[2].id).toBe(first.blocks[0].id);
  expect(next.next.blocks[2].revision).not.toBe(first.blocks[0].revision);
  expect(source.text).toContain('不负责模型训练');
});

test('预算包括退役历史，不静默删除来制造省钱收益', () => {
  expect(() => prepare({ maxStoredCharacters: 10 })).toThrow('SEMANTIC_STORAGE_BUDGET_EXCEEDED');
  expect(() => prepare({ maxBlocks: 1 })).toThrow('INVALID_ORGANIZATION');
});

test('并发写入比较存储版本，不静默覆盖另一轮', async () => {
  const result = prepare(), store = createInMemorySemanticStore(emptySemanticState('owner', 'job'));
  await store.compareAndSwap(0, result.next);
  await expect(store.compareAndSwap(0, result.next)).rejects.toThrow('MEMORY_REVISION_CHANGED');
  expect((await store.read()).revision).toBe(1);
});

test('空来源、重复ID和外部形状不能形成合法整理', () => {
  expect(() => prepare({ proposal: { blocks: [] } })).toThrow('INVALID_ORGANIZATION');
  expect(() => prepare({ proposal: { blocks: [{ ...proposal.blocks[0], evidence: [] }] } }))
    .toThrow('MEMORY_EVIDENCE_REQUIRED');
  expect(() => prepare({ proposal: { blocks: [proposal.blocks[0], proposal.blocks[0]] } })).toThrow('INVALID_MEMORY_ID');
  expect(() => prepare({ proposal: { blocks: [{ ...proposal.blocks[0], id: '../source' }] } })).toThrow('INVALID_MEMORY_ID');
});
