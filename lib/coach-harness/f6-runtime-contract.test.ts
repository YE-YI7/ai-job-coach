import {f6RuntimeIdentity,F6_RUNTIME_VERSION} from './f6-runtime-contract';
import {F6_RESUME_WRITER,F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';
import {F6_NATIVE_WORKFLOW} from './resume-f6-review-policy';

test('the actual writer, workflow receipt and public release identity cannot drift',()=>{
  expect(F6_RESUME_WRITER).toBe(F6_RUNTIME_VERSION);
  expect(F6_NATIVE_WORKFLOW).toBe(F6_RUNTIME_VERSION);
  expect(f6RuntimeIdentity()).toEqual({
    version:F6_RESUME_WRITER,
    originSystemSha256:'93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4',
    toolsSha256:'a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d',
    tools:['read_file','search','fetch','write_output','render_pdf'],
    maxAuthorCalls:F6_MAX_AUTHOR_CALLS,
    maxPublicRequests:4,
    publicBudgetContinuation:'exhausted_tools_unavailable_keep_evidence',
    authorExecutionState:'remaining_calls_and_exact_read_references',
    mentorGuidance:'optional_same_author_changes_md',
    mentorGuidancePolicySha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    mentorResponseDelivery:'typed_document_or_retained_body_with_reply',
    mentorResponseChannelsSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    automaticJudge:true,
    blockingJudge:false,
    hrCommentary:'plain_text_one_author_response',
    maxHrCalls:1,
    modelSelection:'preserve-user-selection',
  });
  expect(F6_MAX_AUTHOR_CALLS).toBe(12);
});
