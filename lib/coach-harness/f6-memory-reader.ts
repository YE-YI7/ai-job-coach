import {getDbClient} from '@/lib/db';
import {evidenceTerms} from './evidence-retrieval';
import type {F6MemoryDocument, F6MemoryReader} from './f6-context-tools';

type Row = {id: string; user_id: string; opportunity_id: string | null; display_text: string;
  source_id: string | null; source_kind: string; status: string; visibility: string; updated_at: string};
const columns = 'id,user_id,opportunity_id,display_text,source_id,source_kind,status,visibility,updated_at';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only existing claims. Neither chat transcripts nor AI-generated
 * summaries are imported or promoted into personal facts by this reader. */
export function createF6MemoryReader(input: {userId: string; opportunityId: string | null;
  currentResume: string; originalResume: string}): F6MemoryReader {
  if (!uuid.test(input.userId) || (input.opportunityId && !uuid.test(input.opportunityId))) throw Error('MEMORY_SCOPE_INVALID');
  const scope = input.opportunityId
    ? `or(opportunity_id.eq.${input.opportunityId},opportunity_id.is.null)` : 'opportunity_id.is.null';
  async function base() {
    const db = await getDbClient();
    if (!db) throw Error('MEMORY_STORE_UNAVAILABLE');
    return {query: db.from('coach_claims').select(columns, {count: 'exact'}).eq('user_id', input.userId)
      .in('status', ['confirmed', 'unverified']).eq('visibility', 'recruiter_safe')
      .in('source_kind', ['user_upload', 'user_statement'])};
  }
  function allowed(row: Row) {
    return row.user_id === input.userId && (!row.opportunity_id || row.opportunity_id === input.opportunityId)
      && ['confirmed', 'unverified'].includes(row.status) && row.visibility === 'recruiter_safe'
      && ['user_upload', 'user_statement'].includes(row.source_kind);
  }
  function duplicate(row: Row) {
    const value = row.display_text?.trim();
    return !value || input.currentResume.includes(value) || input.originalResume.includes(value);
  }
  function document(row: Row): F6MemoryDocument {
    return {id: row.id, text: row.display_text, sourceId: row.source_id, sourceKind: row.source_kind,
      status: row.status, updatedAt: row.updated_at, verification: 'user_report_not_independently_verified'};
  }
  return {
    preload: async () => {
      const documents: F6MemoryDocument[] = [], seen = new Set<string>();
      let expected: number | undefined, bytes = 0;
      for (let offset = 0; offset < 2000; offset += 200) {
        const {query} = await base();
        const {data, error, count} = await query.or(scope).order('id', {ascending: true})
          .range(offset, offset + 199).abortSignal(AbortSignal.timeout(10000));
        if (error) throw Error('MEMORY_PRELOAD_FAILED');
        if (typeof count !== 'number' || count > 2000 || expected !== undefined && count !== expected) {
          return {complete: false, documents: []};
        }
        expected = count;
        const rows = (data || []) as Row[];
        for (const row of rows) if (allowed(row) && !duplicate(row)) {
          const value = row.display_text.trim();
          if (seen.has(value)) continue;
          seen.add(value);
          const item = document(row);
          bytes += Buffer.byteLength(JSON.stringify(item));
          if (bytes > 64_000) return {complete: false, documents: []};
          documents.push(item);
        }
        if (offset + rows.length >= count) return {complete: true, documents};
        if (rows.length < 200) return {complete: false, documents: []};
      }
      return {complete: false, documents: []};
    },
    search: async (question, offset) => {
      const terms = evidenceTerms(question);
      if (!terms.length) throw Error('MEMORY_QUERY_TOO_VAGUE');
      // Terms contain only letter/number/underscore/hyphen or Han bigrams.
      // User identity/scope are server values, never model arguments.
      const filter = `and(${scope},or(${terms.map(term => `display_text.ilike.*${term}*`).join(',')}))`;
      const {query} = await base();
      const {data, error, count} = await query.or(filter).order('id', {ascending: true})
        .range(offset, offset + 199).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_SEARCH_FAILED');
      const rows = (data || []) as Row[];
      const candidates = rows.filter(row => allowed(row) && !duplicate(row));
      const ranked = candidates.map(row => ({row,
        score: terms.reduce((sum, term) => sum + Number(row.display_text.toLowerCase().includes(term)), 0)}))
        .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
      return {query: question, scope: 'current_opportunity_and_recruiter_safe_global_materials_of_current_user',
        contentRead: false, excludedCurrentResume: rows.filter(row => allowed(row) && duplicate(row)).length,
        matches: ranked.map(({row}) => ({id: row.id, preview: row.display_text.slice(0, 240),
          previewOnly: row.display_text.length > 240, sourceId: row.source_id, sourceKind: row.source_kind,
          status: row.status, updatedAt: row.updated_at})),
        hasMore: count === null ? rows.length === 200 : offset + rows.length < count,
        nextOffset: offset + rows.length, verification: 'user_report_not_independently_verified'};
    },
    read: async requested => {
      if (requested.some(id => !uuid.test(id))) throw Error('MEMORY_IDS_INVALID');
      const {query} = await base();
      const {data, error} = await query.or(scope).in('id', requested).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_READ_FAILED');
      const documents = ((data || []) as Row[]).filter(row => allowed(row) && !duplicate(row)).map(document);
      return {documents, unavailableIds: requested.filter(id => !documents.some(item => item.id === id))};
    },
  };
}
