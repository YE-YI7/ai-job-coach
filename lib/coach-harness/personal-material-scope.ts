import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';

type ClaimScope = {
  opportunity_id?: unknown; source_id?: unknown; entity_type?: unknown;
};
type Source = {id: string; user_id: string; opportunity_id: string | null; content_hash: string};

/** Account ownership is necessary, not proof that two uploaded candidates are
 * the same person. A shared résumé is an explicit material link; a global flag
 * or similar project words are not. No identity guessing or historical writes. */
export async function personalMaterialScope(input: {
  userId: string; opportunityId: string | null; resumes: string[];
}) {
  const hashes = [...new Set(input.resumes.filter(text => text.trim()).flatMap(text =>
    [text, text.trim()].map(value => createHash('sha256').update(value).digest('hex'))))];
  const sources: Source[] = [];
  if (hashes.length) {
    const db = await getDbClient();
    if (!db) throw Error('MEMORY_STORE_UNAVAILABLE');
    const {data, error} = await db.from('coach_sources')
      .select('id,user_id,opportunity_id,content_hash').eq('user_id', input.userId)
      .eq('source_type', 'resume').in('content_hash', hashes)
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw Error('MEMORY_SOURCE_SCOPE_FAILED');
    sources.push(...((data || []) as Source[]).filter(source =>
      source.user_id === input.userId && hashes.includes(source.content_hash)));
  }
  const sourceIds = new Set(sources.map(source => source.id));
  const opportunityIds = [...new Set([input.opportunityId,
    ...sources.map(source => source.opportunity_id)].filter((id): id is string => Boolean(id)))];
  const filters = ['and(opportunity_id.is.null,entity_type.eq.preference)'];
  if (opportunityIds.length) filters.push(`opportunity_id.in.(${opportunityIds.join(',')})`);
  if (sourceIds.size) filters.push(`and(opportunity_id.is.null,source_id.in.(${[...sourceIds].join(',')}))`);
  return {
    opportunityIds,
    filter: filters.join(','),
    accepts: (row: ClaimScope) => {
      if (row.opportunity_id) return opportunityIds.includes(String(row.opportunity_id));
      // Account-level preferences do not certify candidate experience.
      if (row.entity_type === 'preference') return true;
      return Boolean(row.source_id && sourceIds.has(String(row.source_id)));
    },
  };
}
