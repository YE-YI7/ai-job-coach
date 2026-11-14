import {createHash} from 'node:crypto';
import origin from './f6-origin.json';
import {F6_MENTOR_RESPONSIBILITY, F6_MENTOR_HR_RESPONSE_CHANNELS} from './f6-mentor-guidance';
import {F6_HR_PROMPT} from './f6-hr-review';
import {F6_MENTOR_TOOLS} from './f6-output-channels';
import {f6AuthorContract} from './f6-author-contract';
import {F6_SCREENING_PROMPT} from './f6-screening-review';
import {f6ContextToolCatalogue} from './f6-context-tools';
import {f6ContextSpecification} from './f6-context-contract';
import {f6KnowledgeCatalogue} from './f6-knowledge-catalogue';

export const F6_RUNTIME_VERSION = 'f6-origin-runtime-v25-screening-value-autonomous-context' as const;
const digest = (value: unknown) => createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/** Public, non-personal release receipt. The writer and the health endpoint
 * share this identity; an environment flag cannot secretly select an old writer. */
export function f6RuntimeIdentity() {
  const complete = f6ContextToolCatalogue(F6_MENTOR_TOOLS, false);
  const lookup = f6ContextToolCatalogue(F6_MENTOR_TOOLS, true);
  return {
    version: F6_RUNTIME_VERSION,
    originSystemSha256: origin.systemHash,
    toolsSha256: digest(lookup),
    originToolsSha256: createHash('sha256').update(JSON.stringify(origin.tools)).digest('hex'),
    tools: lookup.map(tool => tool.function.name),
    authorSystemSha256: digest(f6AuthorContract('whole')),
    singleAuthorSystemSha256: digest(f6AuthorContract('single')),
    toolVariants: {
      completeMaterials: {tools: complete.map(tool => tool.function.name), sha256: digest(complete)},
      onDemandMemory: {tools: lookup.map(tool => tool.function.name), sha256: digest(lookup)},
    },
    contextSpecificationSha256: digest(f6ContextSpecification('')),
    knowledgeCatalogueSha256: digest(f6KnowledgeCatalogue()),
    personalMaterials: 'owned_deduplicated_complete_preload_otherwise_agent_lookup',
    contextToolAccess: 'production_no_qa_allowlist',
    acceptedEvalRecord: 'c1255da4-9575-4f51-9cd4-dfe66cf2e85c',
    maxAuthorCalls: origin.maxAuthorCalls,
    maxPublicRequests: origin.maxPublicRequests,
    publicBudgetContinuation: 'exhausted_tools_unavailable_keep_evidence',
    publicResearch: 'author_queries_and_public_urls_local_privacy_checks',
    authorExecutionState: 'remaining_calls_read_references_and_delivery_state',
    mentorGuidance: 'optional_same_author_mentor_md_internal_changes_preserved',
    mentorGuidancePolicySha256: createHash('sha256').update(F6_MENTOR_RESPONSIBILITY).digest('hex'),
    mentorResponseDelivery: 'explicit_user_guidance_separate_internal_hr_response',
    mentorResponseChannelsSha256: createHash('sha256').update(F6_MENTOR_HR_RESPONSE_CHANNELS).digest('hex'),
    conversationContext: 'latest_projected_draft_and_original_source',
    editingContext: 'current_visible_draft_original_evidence_historical_instructions',
    editingOutcome: 'increment_against_current_document_not_old_source',
    conversationEvidence: 'literal_user_quotes_original_references_untrusted_not_applied',
    conversationLocation: 'versioned_current_to_original_mapping_not_factual_evidence',
    automaticJudge: true,
    blockingJudge: false,
    hrCommentary: 'plain_text_one_author_response',
    hrEvidence: 'current_candidate_and_hiring_context_only',
    hrSourceTransport: 'candidate_plain_text_with_sha_and_current_date',
    hrAuthorEvidence: 'same_hr_commentary_and_reviewed_candidate_not_new_user_facts',
    hrCoachingEvidence: 'current_mentor_and_unanswered_state_to_original_author_only',
    hrReviewPolicySha256: digest(F6_SCREENING_PROMPT),
    legacyHrReviewPolicySha256: digest(F6_HR_PROMPT),
    maxHrCalls: 1,
    modelSelection: 'preserve-user-selection',
    resumeModel: 'deepseek-flash',
    resumeModelRouting: 'official_hosted_or_existing_connected_v4.1_flash_no_step_substitution',
  };
}
