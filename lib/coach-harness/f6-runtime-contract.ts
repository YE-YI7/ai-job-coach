import {createHash} from 'node:crypto';
import origin from './f6-origin.json';
import {F6_MENTOR_RESPONSIBILITY, F6_MENTOR_HR_RESPONSE_CHANNELS} from './f6-mentor-guidance';

export const F6_RUNTIME_VERSION = 'f6-origin-runtime-v8-mentor-response-delivery' as const;

/** Public, non-personal release receipt. The writer and the health endpoint
 * share this identity; an environment flag cannot secretly select an old writer. */
export function f6RuntimeIdentity() {
  return {
    version: F6_RUNTIME_VERSION,
    originSystemSha256: origin.systemHash,
    toolsSha256: createHash('sha256').update(JSON.stringify(origin.tools)).digest('hex'),
    tools: origin.tools.map(tool => tool.function.name),
    maxAuthorCalls: origin.maxAuthorCalls,
    maxPublicRequests: origin.maxPublicRequests,
    publicBudgetContinuation: 'exhausted_tools_unavailable_keep_evidence',
    authorExecutionState: 'remaining_calls_and_exact_read_references',
    mentorGuidance: 'optional_same_author_changes_md',
    mentorGuidancePolicySha256: createHash('sha256').update(F6_MENTOR_RESPONSIBILITY).digest('hex'),
    mentorResponseDelivery: 'typed_document_or_retained_body_with_reply',
    mentorResponseChannelsSha256: createHash('sha256').update(F6_MENTOR_HR_RESPONSE_CHANNELS).digest('hex'),
    automaticJudge: true,
    blockingJudge: false,
    hrCommentary: 'plain_text_one_author_response',
    maxHrCalls: 1,
    modelSelection: 'preserve-user-selection',
  };
}
