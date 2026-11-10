import {f6RuntimeIdentity,F6_RUNTIME_VERSION} from './f6-runtime-contract';
import {F6_RESUME_WRITER,F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';
import {F6_NATIVE_WORKFLOW} from './resume-f6-review-policy';

test('the actual writer, workflow receipt and public release identity cannot drift',()=>{
  expect(F6_RESUME_WRITER).toBe(F6_RUNTIME_VERSION);
  expect(F6_NATIVE_WORKFLOW).toBe(F6_RUNTIME_VERSION);
  expect(f6RuntimeIdentity()).toEqual({
    version:F6_RESUME_WRITER,
    originSystemSha256:'93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4',
    toolsSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    originToolsSha256:'a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d',
    tools:['read_file','search','fetch','write_output','render_pdf'],
    maxAuthorCalls:F6_MAX_AUTHOR_CALLS,
    maxPublicRequests:4,
    publicBudgetContinuation:'exhausted_tools_unavailable_keep_evidence',
    authorExecutionState:'remaining_calls_read_references_and_delivery_state',
    mentorGuidance:'optional_same_author_mentor_md_internal_changes_preserved',
    mentorGuidancePolicySha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    mentorResponseDelivery:'explicit_user_guidance_separate_internal_hr_response',
    mentorResponseChannelsSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    conversationContext:'latest_projected_draft_and_original_source',
    conversationEvidence:'literal_user_quotes_original_references_untrusted_not_applied',
    conversationLocation:'versioned_current_to_original_mapping_not_factual_evidence',
    automaticJudge:true,
    blockingJudge:false,
    hrCommentary:'plain_text_one_author_response',
    hrEvidence:'same_candidate_version_nonblocking_hints_to_hr_and_author',
    hrSourceTransport:'native_readable_documents_with_sha_references',
    hrAuthorEvidence:'existing_literal_projection_diff_as_readable_data',
    hrCoachingEvidence:'same_revision_explicit_mentor_artifact_not_candidate_fact',
    hrReviewPolicySha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    maxHrCalls:1,
    modelSelection:'preserve-user-selection',
  });
  expect(F6_MAX_AUTHOR_CALLS).toBe(12);
});
