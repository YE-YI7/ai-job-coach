import {f6RuntimeIdentity,F6_RUNTIME_VERSION} from './f6-runtime-contract';
import {F6_RESUME_WRITER,F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';
import {F6_NATIVE_WORKFLOW} from './resume-f6-review-policy';

test('the actual writer, workflow receipt and public release identity cannot drift',()=>{
  expect(F6_RESUME_WRITER).toBe(F6_RUNTIME_VERSION);
  expect(F6_NATIVE_WORKFLOW).toBe(F6_RUNTIME_VERSION);
  expect(f6RuntimeIdentity()).toMatchObject({
    version:F6_RESUME_WRITER,
    originSystemSha256:'93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4',
    toolsSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    originToolsSha256:'a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d',
    tools:['read_file','search','fetch','write_output','render_pdf',
      'knowledge_search','knowledge_read','memory_search','memory_read'],
    authorSystemSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    singleAuthorSystemSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    contextToolAccess:'production_no_qa_allowlist',
    acceptedEvalRecord:'c1255da4-9575-4f51-9cd4-dfe66cf2e85c',
    maxAuthorCalls:F6_MAX_AUTHOR_CALLS,
    maxPublicRequests:4,
    publicBudgetContinuation:'exhausted_tools_unavailable_keep_evidence',
    publicResearch:'author_queries_and_public_urls_local_privacy_checks',
    authorExecutionState:'remaining_calls_read_references_and_delivery_state',
    mentorGuidance:'optional_same_author_mentor_md_internal_changes_preserved',
    mentorGuidancePolicySha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    mentorResponseDelivery:'explicit_user_guidance_separate_internal_hr_response',
    mentorResponseChannelsSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    conversationContext:'latest_projected_draft_and_original_source',
    editingContext:'current_visible_draft_original_evidence_historical_instructions',
    editingOutcome:'increment_against_current_document_not_old_source',
    conversationEvidence:'literal_user_quotes_original_references_untrusted_not_applied',
    conversationLocation:'versioned_current_to_original_mapping_not_factual_evidence',
    automaticJudge:true,
    blockingJudge:false,
    hrCommentary:'plain_text_one_author_response',
    hrEvidence:'current_candidate_and_hiring_context_only',
    hrSourceTransport:'candidate_plain_text_with_sha_and_current_date',
    hrAuthorEvidence:'same_hr_commentary_and_reviewed_candidate_not_new_user_facts',
    hrCoachingEvidence:'current_mentor_and_unanswered_state_to_original_author_only',
    hrReviewPolicySha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    maxHrCalls:1,
    modelSelection:'preserve-user-selection',
    resumeModel:'deepseek-flash',
  });
  expect(F6_MAX_AUTHOR_CALLS).toBe(12);
});

test('the accepted v25 author, HR and tool contracts remain frozen until another explicit acceptance',()=>{
  // c1255da4: three accepted runs replayed byte-for-byte through the normal POST route.
  // These are release receipts, not a substitute for a new quality experiment.
  expect(f6RuntimeIdentity()).toMatchObject({
    version:'f6-origin-runtime-v25-screening-value-autonomous-context',
    authorSystemSha256:'ebcde5df37136aa8c24f9c2dd1373a785bb859ef4482a9ca9f901a61f261b993',
    singleAuthorSystemSha256:'62f711c13af631d2d0dc92e5a9b4b46f7a2c6c63bfd45009f065a3daef9b4676',
    toolsSha256:'d515b966d1f4a27b1f6acb990f6440bae5fd67623b5f7c34a8070c8b6e46cfcb',
    contextSpecificationSha256:'aedac64489e15d2a4dd2436483f8b388d076a56acb084b382cc53113970a8f0b',
    knowledgeCatalogueSha256:'2b6d1f365b956a105bff05d25b3bb4ce7d01cbe8fc3c272da4c643af0f96f0f8',
    hrReviewPolicySha256:'d01bd25d4d9f64fdaf68349b976599c2ba56eedcfd2bb1dabeea48a80d58117b',
    toolVariants:{
      completeMaterials:{sha256:'18d25c47f9721db21e59b7be225dc7e4b69aa3904954773ae267c432453496d8'},
    },
  });
});
