import { extractiveOrganization, compileMemoryFacts, assertMemoryFactsBound, type MemoryFactPacket } from './extractive-memory';
import { memoryHash, type MemorySnapshot } from './context-memory';

const snapshot: MemorySnapshot = { ownerId: 'owner', opportunityId: null, complete: true, limitations: [], documents: [
  { id: 'a', ownerId: 'owner', opportunityId: null, kind: 'history', trust: 'user', canSupportFact: false,
    status: 'active', title: '验收边界', text: '我负责验收，不负责训练。收益未确认。', revision: 'r1', sourceIds: [] },
  { id: 'b', ownerId: 'owner', opportunityId: null, kind: 'claim', trust: 'user', canSupportFact: true,
    status: 'active', title: '回放修复', text: '用9项输出回放修复列表误拦，不证明语义质量通过。', revision: 'r2', sourceIds: [] },
] };

test('模型只选原文块和分类，宿主生成正文；否定/未知和责任限定不丢', () => {
  const p = extractiveOrganization(snapshot, { blocks: [{ category: '贡献', sourceIds: ['b', 'a'] }] });
  expect(p.blocks[0].summary).toBe(snapshot.documents[1].text + snapshot.documents[0].text);
  expect(p.blocks[0].evidence?.map(e => e.quote)).toEqual([snapshot.documents[1].text, snapshot.documents[0].text]);
  expect(p.blocks[0].description).toBe(snapshot.documents[1].text + ' / ' + snapshot.documents[0].text);
});

test.each(['summary', 'description', 'object', 'title', 'aliases', 'evidence'])('拒绝模型自填%s，不能拿合法引文给无源扩写背书', key => {
  expect(() => extractiveOrganization(snapshot, { blocks: [{ category: '贡献', sourceIds: ['a'], [key]: '主导全部训练并提升收入' }] }))
    .toThrow('EXTRACTIVE_NO_GENERATED_TEXT');
});

test('同一来源不能重复塞进多个块制造膨胀', () => {
  expect(() => extractiveOrganization(snapshot, { blocks: [{ category: '一', sourceIds: ['a'] }, { category: '二', sourceIds: ['a'] }] }))
    .toThrow('INVALID_EXTRACTIVE_SOURCE');
});

test.each(['external', 'withdrawn', 'conflicted', 'other_owner'])('禁止从%s来源提炼个人记忆', kind => {
  const copy = structuredClone(snapshot);
  if (kind === 'external') copy.documents[0].trust = 'external';
  else if (kind === 'other_owner') copy.documents[0].ownerId = 'other';
  else copy.documents[0].status = kind as 'withdrawn' | 'conflicted';
  expect(() => extractiveOrganization(copy, { blocks: [{ category: '贡献', sourceIds: ['a'] }] })).toThrow('INVALID_EXTRACTIVE_SOURCE');
});

const base = { selected: [{ id: 'semantic:a', revision: 'm1' }], facts: [{ sourceId: 'a', sourceRevision: 'r1', text: snapshot.documents[0].text }] };
const packet: MemoryFactPacket = { ...base, packetHash: memoryHash(base) };
const facts = '[a] 旧内容\n[b] 不应该暗塞\n[resume-line-1] 原稿';

test('只编入Agent实际装入的证据，不按全量来源目录偷偷补齐；原稿事实不改', () => {
  expect(compileMemoryFacts(facts, ['a', 'b'], packet)).toBe(`[a] ${snapshot.documents[0].text}\n[resume-line-1] 原稿`);
});

test('实际编辑facts被删改或偷塞未选资料时拦下；不是只检查有Memory ID', () => {
  const actualFacts = compileMemoryFacts(facts, ['a', 'b'], packet);
  expect(assertMemoryFactsBound({ actualFacts, baselineFacts: facts, allPrivateSourceIds: ['a', 'b'], packet }).sourceIds).toEqual(['a']);
  expect(() => assertMemoryFactsBound({ actualFacts: facts, baselineFacts: facts, allPrivateSourceIds: ['a', 'b'], packet }))
    .toThrow('MEMORY_NOT_BOUND_TO_EDITOR_INPUT');
});

test('packet被修改、为空或来源不属于冻结编辑合同不能进入编辑', () => {
  expect(() => compileMemoryFacts(facts, ['a', 'b'], { ...packet, facts: [] })).toThrow('INVALID_MEMORY_FACT_PACKET');
  expect(() => compileMemoryFacts(facts, ['b'], packet)).toThrow('INVALID_MEMORY_FACT_PACKET');
  expect(() => compileMemoryFacts('[resume-line-1] 原稿', ['a', 'b'], packet)).toThrow('MEMORY_SOURCE_NOT_IN_EDITOR_CONTRACT');
});
