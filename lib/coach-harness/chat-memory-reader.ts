import {getDbClient} from '@/lib/db';
import {evidenceTerms} from './evidence-retrieval';
import type {F6MemoryDocument} from './f6-context-tools';

type UserTurn = {
  id: string; user_id: string; opportunity_id: string | null; question: string;
  created_at: string; learning_trace?: {proactive?: boolean};
};
// Do not select answer, model output, a session summary or a tutor example.
const columns = 'id,user_id,opportunity_id,question,created_at,learning_trace->proactive';

export function chatMemoryReader(userId: string, opportunityIds: string[]) {
  const allowed = (row: UserTurn & {proactive?: boolean}) => row.user_id === userId
    && Boolean(row.opportunity_id && opportunityIds.includes(row.opportunity_id))
    && row.proactive !== true && row.learning_trace?.proactive !== true && Boolean(row.question?.trim());
  async function query() {
    const db = await getDbClient();
    if (!db) throw Error('MEMORY_STORE_UNAVAILABLE');
    return {query: db.from('coach_agent_turns').select(columns, {count: 'exact'})
      .eq('user_id', userId).in('opportunity_id', opportunityIds)
      .or('learning_trace->>proactive.is.null,learning_trace->>proactive.neq.true')};
  }
  function document(row: UserTurn): F6MemoryDocument {
    return {id: row.id, text: row.question.trim(), sourceId: row.id, sourceKind: 'user_statement',
      status: 'unverified', updatedAt: row.created_at, verification: 'user_report_not_independently_verified',
      sourceType: 'coach_agent_turns.question',
      interpretation: '用户原话，可能含问题、假设或引用；只把用户确实陈述为自身经历的部分用于改稿。导师回答未被返回。'};
  }
  return {
    count: async () => {
      if (!opportunityIds.length) return 0;
      const {query: q} = await query();
      const {data, error, count} = await q.range(0, 0).abortSignal(AbortSignal.timeout(10000));
      if (error || typeof count !== 'number') throw Error('MEMORY_CHAT_COUNT_FAILED');
      return count || (data || []).filter(allowed).length;
    },
    search: async (question: string, offset: number) => {
      if (!opportunityIds.length) return {documents: [], count: 0, scanned: 0};
      const terms = evidenceTerms(question), {query: q} = await query();
      const {data, error, count} = await q.or(terms.map(term => `question.ilike.*${term}*`).join(','))
        .order('id', {ascending: true}).range(offset, offset + 199).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_CHAT_SEARCH_FAILED');
      const rows = (data || []) as UserTurn[];
      return {documents: rows.filter(allowed).map(document), count, scanned: rows.length};
    },
    read: async (ids: string[]) => {
      if (!opportunityIds.length || !ids.length) return [];
      const {query: q} = await query();
      const {data, error} = await q.in('id', ids).abortSignal(AbortSignal.timeout(10000));
      if (error) throw Error('MEMORY_CHAT_READ_FAILED');
      return ((data || []) as UserTurn[]).filter(allowed).map(document);
    },
  };
}
