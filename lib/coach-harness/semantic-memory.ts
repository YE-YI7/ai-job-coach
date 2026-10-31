import 'server-only';
import { memoryHash, type MemoryDocument, type MemorySnapshot } from './context-memory';
import { evidenceTerms } from './evidence-retrieval';

export const SEMANTIC_MEMORY_VERSION = 'semantic-memory/v0.2-M02';
export interface MemoryEvidence {
  sourceId: string;
  revision: string;
  quote: string;
}
export interface SemanticBlock {
  id: string;
  revision: string;
  category: string;
  object: string;
  title: string;
  description: string;
  summary: string;
  aliases: string[];
  evidence: MemoryEvidence[];
  status: 'active' | 'superseded' | 'withdrawn';
  /** AI整理后的内容始终是派生信息，不能因保存成功自动成为本人事实。 */
  canSupportFact: false;
}
export interface SemanticState {
  version: typeof SEMANTIC_MEMORY_VERSION;
  ownerId: string;
  opportunityId: string | null;
  revision: number;
  blocks: SemanticBlock[];
}
export interface SemanticStore {
  read(): Promise<SemanticState>;
  compareAndSwap(expectedRevision: number, next: SemanticState): Promise<void>;
}
export interface OrganizeInput {
  blocks: Array<{
    id?: string;
    category: string;
    object: string;
    title: string;
    description: string;
    summary: string;
    aliases?: string[];
    evidence: MemoryEvidence[];
  }>;
  supersedes?: Array<{ id: string; revision: string }>;
}

function required(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('INVALID_MEMORY_TEXT');
  return value.trim();
}
export function emptySemanticState(ownerId: string, opportunityId: string | null): SemanticState {
  return { version: SEMANTIC_MEMORY_VERSION, ownerId, opportunityId, revision: 0, blocks: [] };
}
export function assertSemanticScope(state: SemanticState, snapshot: MemorySnapshot) {
  if (state.version !== SEMANTIC_MEMORY_VERSION || state.ownerId !== snapshot.ownerId
    || state.opportunityId !== snapshot.opportunityId) throw Error('SEMANTIC_SCOPE_MISMATCH');
}

/** 每次回读都重验来源当前版本。撤回/改版后，旧摘要不会因为仍在磁盘而复活。 */
export function blockIsCurrent(block: SemanticBlock, snapshot: MemorySnapshot): boolean {
  return block.status === 'active' && block.evidence.every(e => {
    const source = snapshot.documents.find(d => d.id === e.sourceId);
    return source?.status === 'active' && source.revision === e.revision && source.text.includes(e.quote);
  });
}

/** 模型负责重点选取和语义分类；宿主只守归属、原文证据、版本和预算，不写死六类或工序。 */
export function prepareOrganization(input: {
  state: SemanticState;
  snapshot: MemorySnapshot;
  proposal: OrganizeInput;
  maxBlocks: number;
  maxStoredCharacters: number;
}) {
  assertSemanticScope(input.state, input.snapshot);
  const { proposal, state, snapshot } = input;
  if (!proposal || !Array.isArray(proposal.blocks) || !proposal.blocks.length
    || proposal.blocks.length > input.maxBlocks) throw Error('INVALID_ORGANIZATION');
  const retired = new Set<string>();
  for (const target of proposal.supersedes || []) {
    const old = state.blocks.find(b => b.id === target.id);
    if (!old || old.revision !== target.revision || old.status !== 'active') throw Error('MEMORY_REVISION_CHANGED');
    retired.add(old.id);
  }
  const newIds = new Set<string>();
  const blocks = proposal.blocks.map(raw => {
    if (!Array.isArray(raw.evidence) || !raw.evidence.length) throw Error('MEMORY_EVIDENCE_REQUIRED');
    const evidence = raw.evidence.map(e => {
      const source = snapshot.documents.find(d => d.id === e.sourceId);
      const quote = required(e.quote, 10000);
      if (!source || source.ownerId !== snapshot.ownerId
        || (source.opportunityId !== null && source.opportunityId !== snapshot.opportunityId)
        || source.status !== 'active' || source.revision !== e.revision || !source.text.includes(quote)) {
        throw Error('MEMORY_EVIDENCE_NOT_CURRENT');
      }
      // AI回答和外部网页可供参考，但不能变成个人长期资料的来源。
      if (source.trust !== 'user') throw Error('MEMORY_REQUIRES_USER_SOURCE');
      return { sourceId: source.id, revision: source.revision, quote };
    });
    const content = {
      category: required(raw.category, 100), object: required(raw.object, 200),
      title: required(raw.title, 160), description: required(raw.description, 1000),
      summary: required(raw.summary, 10000),
      aliases: (raw.aliases || []).map(a => required(a, 100)), evidence,
      canSupportFact: false as const,
    };
    const id = raw.id ? required(raw.id, 120) : `semantic:${memoryHash(content).slice(0, 24)}`;
    if (!/^semantic:[a-zA-Z0-9_-]+$/.test(id) || newIds.has(id)) throw Error('INVALID_MEMORY_ID');
    const existing = state.blocks.find(b => b.id === id);
    if (existing && (!retired.has(id) || existing.status !== 'active')) throw Error('MEMORY_REPLACE_REQUIRES_REVISION');
    newIds.add(id);
    return { ...content, id, revision: memoryHash(content), status: 'active' as const };
  });
  const next: SemanticState = {
    ...structuredClone(state), revision: state.revision + 1,
    blocks: [
      ...state.blocks.map(b => retired.has(b.id) ? { ...b, status: 'superseded' as const } : b),
      ...blocks,
    ],
  };
  // 退役版本也计算存储，不删除旧记忆来伪造压缩收益；保留/归档策略另设。
  if (next.blocks.filter(b => b.status === 'active').length > input.maxBlocks
    || JSON.stringify(next).length > input.maxStoredCharacters) throw Error('SEMANTIC_STORAGE_BUDGET_EXCEEDED');
  const sourceIds = new Set(blocks.flatMap(b => b.evidence.map(e => e.sourceId)));
  return {
    next,
    blocks,
    metrics: {
      sourceCharacters: snapshot.documents.filter(d => sourceIds.has(d.id)).reduce((n, d) => n + d.text.length, 0),
      summaryCharacters: blocks.reduce((n, b) => n + b.summary.length, 0),
      retainedEvidenceCharacters: blocks.reduce((n, b) => n + b.evidence.reduce((m, e) => m + e.quote.length, 0), 0),
      storageCharacters: JSON.stringify(next).length,
      semanticFidelityVerified: false,
    },
  };
}

/** 搜索完整有效集合，同时搜说明与正文/原文摘录；不按热度或最近N条预截候选。 */
export function searchSemanticBlocks(state: SemanticState, snapshot: MemorySnapshot, query: string, limit: number) {
  assertSemanticScope(state, snapshot);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('INVALID_MEMORY_LIMIT');
  const terms = evidenceTerms(required(query, 2000));
  const matches = state.blocks.filter(b => blockIsCurrent(b, snapshot)).map(b => {
    const text = [b.category, b.object, b.title, b.description, b.summary, ...b.aliases,
      ...b.evidence.map(e => e.quote)].join('\n').toLowerCase();
    return { block: b, score: terms.reduce((n, term) => n + Number(text.includes(term)), 0) };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score || a.block.id.localeCompare(b.block.id));
  return { matches: matches.slice(0, limit), totalMatches: matches.length, moreMatches: matches.length > limit };
}

export function semanticDocument(block: SemanticBlock, snapshot: MemorySnapshot): MemoryDocument {
  if (!blockIsCurrent(block, snapshot)) throw Error('MEMORY_EVIDENCE_NOT_CURRENT');
  return {
    id: block.id, ownerId: snapshot.ownerId, opportunityId: snapshot.opportunityId,
    kind: 'summary', title: block.title,
    text: JSON.stringify({ category: block.category, object: block.object, description: block.description,
      summary: block.summary, summaryTrust: 'derived_not_confirmed_fact', sourceEvidence: block.evidence }),
    revision: block.revision, status: 'active', trust: 'derived', canSupportFact: false,
    sourceIds: block.evidence.map(e => e.sourceId),
  };
}

export function createInMemorySemanticStore(initial: SemanticState): SemanticStore {
  let state = structuredClone(initial);
  return {
    read: async () => structuredClone(state),
    compareAndSwap: async (revision, next) => {
      if (state.revision !== revision || next.revision !== revision + 1
        || state.ownerId !== next.ownerId || state.opportunityId !== next.opportunityId) {
        throw Error('MEMORY_REVISION_CHANGED');
      }
      state = structuredClone(next);
    },
  };
}
