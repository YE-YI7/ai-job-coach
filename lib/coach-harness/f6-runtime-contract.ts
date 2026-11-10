import {createHash} from 'node:crypto';
import origin from './f6-origin.json';
import {F6_MENTOR_RESPONSIBILITY, F6_MENTOR_HR_RESPONSE_CHANNELS} from './f6-mentor-guidance';

export const F6_RUNTIME_VERSION = 'f6-origin-runtime-v11-versioned-conversation-location' as const;

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
    authorExecutionState: 'remaining_calls_read_references_and_delivery_state',
    mentorGuidance: 'optional_same_author_changes_md',
    mentorGuidancePolicySha256: createHash('sha256').update(F6_MENTOR_RESPONSIBILITY).digest('hex'),
    mentorResponseDelivery: 'explicit_user_guidance_separate_internal_hr_response',
    mentorResponseChannelsSha256: createHash('sha256').update(F6_MENTOR_HR_RESPONSE_CHANNELS).digest('hex'),
    conversationContext: 'latest_projected_draft_and_original_source',
    conversationEvidence: 'literal_user_quotes_original_references_untrusted_not_applied',
    conversationLocation: 'versioned_current_to_original_mapping_not_factual_evidence',
    automaticJudge: true,
    blockingJudge: false,
    hrCommentary: 'plain_text_one_author_response',
    maxHrCalls: 1,
    modelSelection: 'preserve-user-selection',
  };
}
