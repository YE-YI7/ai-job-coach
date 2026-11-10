import {createHash} from 'node:crypto';
import type {F6HrReceipt} from './f6-hr-review';

/** Transport completion only. Never parse or certify HR's semantic judgment. */
export function f6ReviewExecution(receipt: F6HrReceipt | undefined, body: string) {
  if (!receipt) return undefined;
  const record = receipt.records[0];
  const incomplete = receipt.finalState.startsWith('repair_incomplete:')
    || receipt.finalState === 'author_budget_exhausted';
  const status = incomplete ? 'author_response_incomplete' as const
    : record?.status === 'failed' ? 'hr_unavailable' as const
    : ['author_revised_not_rechecked', 'author_retained_not_rechecked'].includes(receipt.finalState)
      ? 'author_responded' as const : 'commentary_only' as const;
  return {version: 1 as const, status, finalState: receipt.finalState, certification: false as const,
    authorBodySha256: createHash('sha256').update(body).digest('hex'),
    ...(record ? {reviewedBodySha256: createHash('sha256').update(record.body).digest('hex')} : {})};
}
export type F6ReviewExecution = NonNullable<ReturnType<typeof f6ReviewExecution>>;
