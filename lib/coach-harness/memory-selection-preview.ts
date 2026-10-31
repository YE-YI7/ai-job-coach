import 'server-only';
import { evidenceTerms } from './evidence-retrieval';
import type { MemorySnapshot } from './context-memory';
import type { SemanticBlock } from './semantic-memory';

export const MEMORY_SELECTION_PREVIEW_VERSION = 'memory-selection-preview/v0.2-M05';

/** Deterministic source windows, not a generated summary. Prefer task matches and concrete interventions. */
export function memoryEvidenceRanges(text: string, query: string, budget = 96) {
  if (text.length <= budget) return [[0, text.length]];
  const terms = evidenceTerms(query);
  const sentences = [...text.matchAll(/[^。！？\n]+[。！？]?/g)].map(match => {
    const start = match.index!, value = match[0];
    const relevance = terms.reduce((score, term) => score + Number(value.toLowerCase().includes(term)), 0);
    const actions = (value.match(/修复|区分|定位|对照|调整|拆分|改为|设计|判断|验证|排查/g) || []).length;
    return { start, end: start + value.length, score: relevance + Math.min(actions, 4) * 2 };
  }).sort((a, b) => b.score - a.score || a.start - b.start);
  const best = sentences[0];
  if (!best || best.score === 0) return [[0, budget]];
  // Keep contiguous original context. A long sentence is not paraphrased or stitched into a new assertion.
  const start = best.end - best.start <= budget ? Math.max(0, Math.min(best.start, text.length - budget)) : best.start;
  return [[start, Math.min(text.length, start + budget)]];
}

/** 只补选材线索，不改排序/摘要，不将预览当已回读/已装载。正文仍须按版本recall/load。 */
export function memorySelectionPreview(block: SemanticBlock, snapshot: MemorySnapshot, query: string) {
  const terms = evidenceTerms(query);
  const candidates = block.evidence.flatMap((evidence, index) => {
    const source = snapshot.documents.find(d => d.id === evidence.sourceId);
    if (!source || source.ownerId !== snapshot.ownerId || source.trust !== 'user'
      || (source.opportunityId !== null && source.opportunityId !== snapshot.opportunityId)
      || source.status !== 'active' || source.revision !== evidence.revision || !evidence.quote.trim()) return [];
    const offset = source.text.indexOf(evidence.quote);
    if (offset < 0) return [];
    const score = terms.reduce((n, term) => n + Number(evidence.quote.toLowerCase().includes(term)), 0);
    return [{ evidence, source, offset, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = candidates[0];
  if (!selected) throw Error('MEMORY_PREVIEW_EVIDENCE_UNAVAILABLE');
  const { evidence, source, offset } = selected;
  const ranges = memoryEvidenceRanges(evidence.quote, query);
  return {
    version: MEMORY_SELECTION_PREVIEW_VERSION,
    sourceId: source.id,
    sourceRevision: source.revision,
    trust: 'user_source_excerpt_not_confirmed',
    previewOnly: true,
    partial: ranges.reduce((n, [start, end]) => n + end - start, 0) < source.text.length,
    excerpts: ranges.map(([start, end]) => ({ start: offset + start, end: offset + end,
      quote: source.text.slice(offset + start, offset + end) })),
  };
}
