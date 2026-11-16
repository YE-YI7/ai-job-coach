import {getDbClient} from '@/lib/db';
import {evidenceTerms} from './evidence-retrieval';
import type {F6MemoryDocument, F6MemoryReader} from './f6-context-tools';
import {personalMaterialScope} from './personal-material-scope';
import {chatMemoryReader} from './chat-memory-reader';

type Row = {id: string; user_id: string; opportunity_id: string | null; display_text: string;
  source_id: string | null; source_kind: string; status: string; visibility: string; updated_at: string; entity_type?: string};
const columns = 'id,user_id,opportunity_id,display_text,source_id,source_kind,status,visibility,updated_at,entity_type';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only scoped sources and user utterances. Tutor examples are never read;
 * a user's question or hypothetical is not promoted into a confirmed claim. */
export function createF6MemoryReader(input: {userId: string; opportunityId: string | null;
  currentResume: string; originalResume: string}): F6MemoryReader {
  if (!uuid.test(input.userId) || (input.opportunityId && !uuid.test(input.opportunityId))) throw Error('MEMORY_SCOPE_INVALID');
  let scopePromise: ReturnType<typeof personalMaterialScope> | undefined;
  const scope = () => scopePromise ??= personalMaterialScope({...input,
    resumes: [input.currentResume, input.originalResume]});
  const chats = async () => chatMemoryReader(input.userId, (await scope()).opportunityIds);
  async function base() {
    const db = await getDbClient();
    if (!db) throw Error('MEMORY_STORE_UNAVAILABLE');
    return {query: db.from('coach_claims').select(columns, {count: 'exact'}).eq('user_id', input.userId)
      .in('status', ['confirmed', 'unverified']).eq('visibility', 'recruiter_safe')
      .in('source_kind', ['user_upload', 'user_statement'])};
  }
  function allowed(row: Row, binding: Awaited<ReturnType<typeof personalMaterialScope>>) {
    return row.user_id === input.userId && binding.accepts(row)
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
      const binding = await scope(), userChatTurns = await (await chats()).count();
      if (userChatTurns) return {complete: false, documents: [], onDemand: {userChatTurns}};
      const documents: F6MemoryDocument[] = [], seen = new Set<string>();
      let expected: number | undefined, bytes = 0;
      for (let offset = 0; offset < 2000; offset += 200) {
        const {query} = await base();
        const {data, error, count} = await query.or(binding.filter).order('id', {ascending: true})
          .range(offset, offset + 199).abortSignal(AbortSignal.timeout(10000));
        if (error) throw Error('MEMORY_PRELOAD_FAILED');
        if (typeof count !== 'number' || count > 2000 || expected !== undefined && count !== expected) {
          return {complete: false, documents: []};
        }
        expected = count;
        const rows = (data || []) as Row[];
        for (const row of rows) if (allowed(row, binding) && !duplicate(row)) {
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
      const binding = await scope();
      // Terms contain only letter/number/underscore/hyphen or Han bigrams.
      // User identity/scope are server values, never model arguments.
      const filter = `and(or(${binding.filter}),or(${terms.map(term => `display_text.ilike.*${term}*`).join(',')}))`;
      const {query} = await base();
      const {data, error, count} = await query.or(filter).order('id', {ascending: true})
        .range(offset, offset + 199).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_SEARCH_FAILED');
      const rows = (data || []) as Row[];
      const userTurns = await (await chats()).search(question, offset);
      const candidates = [...rows.filter(row => allowed(row, binding) && !duplicate(row)).map(document),
        ...userTurns.documents];
      const ranked = candidates.map(row => ({row,
        score: terms.reduce((sum, term) => sum + Number(row.text.toLowerCase().includes(term)), 0)}))
        .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
      return {query: question, scope: 'owned_current_candidate_materials_and_user_utterances',
        contentRead: false, excludedCurrentResume: rows.filter(row => allowed(row, binding) && duplicate(row)).length,
        matches: ranked.map(({row}) => ({id: row.id, preview: row.text.slice(0, 240),
          previewOnly: row.text.length > 240, sourceId: row.sourceId, sourceKind: row.sourceKind,
          sourceType: row.sourceType, interpretation: row.interpretation, status: row.status, updatedAt: row.updatedAt})),
        hasMore: (count === null ? rows.length === 200 : offset + rows.length < count)
          || (userTurns.count === null ? userTurns.scanned === 200 : offset + userTurns.scanned < userTurns.count),
        nextOffset: offset + 200, verification: 'user_report_not_independently_verified'};
    },
    read: async requested => {
      if (requested.some(id => !uuid.test(id))) throw Error('MEMORY_IDS_INVALID');
      const binding = await scope();
      const {query} = await base();
      const {data, error} = await query.or(binding.filter).in('id', requested).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_READ_FAILED');
      const documents = [...((data || []) as Row[]).filter(row => allowed(row, binding) && !duplicate(row)).map(document),
        ...await (await chats()).read(requested)];
      return {documents, unavailableIds: requested.filter(id => !documents.some(item => item.id === id))};
    },
  };
}
