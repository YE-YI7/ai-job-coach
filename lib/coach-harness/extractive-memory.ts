import 'server-only';
import { memoryHash, type MemorySnapshot } from './context-memory';
import type { OrganizeInput } from './semantic-memory';
import { memoryEvidenceRanges } from './memory-selection-preview';

export const EXTRACTIVE_MEMORY_VERSION = 'extractive-memory/v0.1-M03';
export interface ExtractiveOrganization {
  blocks: Array<{ category: string; sourceIds: string[] }>;
}

/** 保留完整证据块，防止截掉同块里的否定、未知或责任限定。模型只选材/分类，不生成事实正文。 */
export function extractiveOrganization(snapshot: MemorySnapshot, raw: unknown): OrganizeInput {
  const proposal = raw as ExtractiveOrganization;
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
    || Object.keys(proposal).some(k => k !== 'blocks') || !Array.isArray(proposal.blocks)
    || !proposal.blocks.length) throw Error('INVALID_EXTRACTIVE_ORGANIZATION');
  const used = new Set<string>();
  const blocks = proposal.blocks.map(block => {
    if (!block || Object.keys(block).some(k => !['category', 'sourceIds'].includes(k))
      || typeof block.category !== 'string' || !block.category.trim() || block.category.length > 40
      || !Array.isArray(block.sourceIds) || !block.sourceIds.length) throw Error('EXTRACTIVE_NO_GENERATED_TEXT');
    const sources = block.sourceIds.map(id => {
      const d = snapshot.documents.find(s => s.id === id);
      if (typeof id !== 'string' || used.has(id) || !d || d.ownerId !== snapshot.ownerId
        || (d.opportunityId !== null && d.opportunityId !== snapshot.opportunityId)
        || d.status !== 'active' || d.trust !== 'user' || !d.text.trim()) throw Error('INVALID_EXTRACTIVE_SOURCE');
      used.add(id); return d;
    });
    return {
      category: block.category.trim(), object: '当前用户的原始证据',
      title: sources.map(s => s.title).join(' / ').slice(0, 160),
      description: sources.map(source => memoryEvidenceRanges(source.text, block.category, 96)
        .map(([start, end]) => source.text.slice(start, end)).join(' … ')).join(' / ').slice(0, 240),
      summary: sources.map(s => s.text).join(''),
      aliases: sources.map(s => s.title.slice(0, 100)),
      evidence: sources.map(s => ({ sourceId: s.id, revision: s.revision, quote: s.text })),
    };
  });
  const inputCharacters = snapshot.documents.reduce((n, d) => n + d.text.length, 0);
  if (blocks.reduce((n, b) => n + b.summary.length, 0) > inputCharacters) throw Error('EXTRACTIVE_MEMORY_EXPANDED');
  return { blocks };
}

export interface MemoryFactPacket {
  selected: Array<{ id: string; revision: string }>;
  facts: Array<{ sourceId: string; sourceRevision: string; text: string }>;
  packetHash: string;
}

/** 只用实际选中并回读的Memory内容拼facts；不按ID从全量来源偷偷补回未取用资料。 */
export function compileMemoryFacts(baselineFacts: string, allPrivateSourceIds: string[], packet: MemoryFactPacket): string {
  if (memoryHash({ selected: packet.selected, facts: packet.facts }) !== packet.packetHash || !packet.facts.length) {
    throw Error('INVALID_MEMORY_FACT_PACKET');
  }
  const selected = new Map(packet.facts.map(f => [f.sourceId, f.text]));
  if (selected.size !== packet.facts.length || packet.facts.some(f => !allPrivateSourceIds.includes(f.sourceId))) {
    throw Error('INVALID_MEMORY_FACT_PACKET');
  }
  const seen = new Set<string>();
  const lines = baselineFacts.split('\n').flatMap(line => {
    const id = allPrivateSourceIds.find(id => line.startsWith(`[${id}] `));
    if (!id) return [line];
    if (!selected.has(id)) return [];
    seen.add(id); return [`[${id}] ${selected.get(id)}`];
  });
  if (seen.size !== selected.size) throw Error('MEMORY_SOURCE_NOT_IN_EDITOR_CONTRACT');
  return lines.join('\n');
}

export function assertMemoryFactsBound(input: {
  actualFacts: string; baselineFacts: string; allPrivateSourceIds: string[]; packet: MemoryFactPacket;
}) {
  const expected = compileMemoryFacts(input.baselineFacts, input.allPrivateSourceIds, input.packet);
  if (input.actualFacts !== expected) throw Error('MEMORY_NOT_BOUND_TO_EDITOR_INPUT');
  return { packetHash: input.packet.packetHash, editorFactsHash: memoryHash(input.actualFacts),
    selectedIds: input.packet.selected.map(s => s.id), sourceIds: input.packet.facts.map(f => f.sourceId) };
}
