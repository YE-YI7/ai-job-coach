import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {f6AuthorSourceDiff} from './f6-author-source-diff';
import {f6CallMessages} from './f6-execution-state';
import {f6ReviewHints} from './f6-review-hints';
import {F6HrReviewSession} from './f6-hr-review';
import {buildChatCompletionRequest} from '@/lib/llm';
import {createHash} from 'node:crypto';
import {F6_MENTOR_TOOLS} from './f6-output-channels';

test('literal before/after evidence becomes readable author input, not a new correction rule',async()=>{
  const source='周然\n教育经历\n甲大学｜本科\n工作经历\n与一名算法和两名后端协作。';
  const body='周然\n工作经历\n3人小组。';
  const hints=f6ReviewHints(source,body,[]);
  const review=new F6HrReviewSession({resume:source,jd:'产品经理',facts:'[]'},async()=>'请核对。',()=>hints);
  await review.inspect(body,1);
  const history=[{role:'tool' as const,tool_call_id:'write-1',content:JSON.stringify({
    saved:['resume-new.md'],hrReview:'请核对。',reviewContext:review.reviewContext()})}];
  const frozen=JSON.stringify(history);
  expect(f6CallMessages(history,0,12)).toEqual(history);
  const messages=f6CallMessages(history,2,12);
  expect(messages.at(-1)!.content).toContain('- 甲大学｜本科');
  expect(messages.at(-1)!.content).toContain('+ 3人小组。');
  expect(messages.at(-1)!.content).not.toContain('必须补回');
  expect(JSON.parse(messages[0].content).reviewContext).not.toHaveProperty('authorSourceDiff');
  expect(JSON.parse(messages[0].content).reviewContext.authorSourceDiffReference.providedAsReadableMessage).toBe(true);
  expect(JSON.stringify(history)).toBe(frozen);
});

const root=process.env.F6_COVERAGE_REPLAY;
(root?test:test.skip)('actual v19 failure supplies unchanged readable projection; preserve paid HR request hash for one-author continuation',()=>{
  const task=JSON.parse(readFileSync(path.join(root!,'attempt-6-task-initial.json'),'utf8')).task;
  const row=JSON.parse(readFileSync(path.join(root!,'attempt-6-coach_eval_runs-initial.json'),'utf8'))
    .find((item:{id:string})=>item.id===task.delivery.evalRunId);
  const hr=row.run.spans.find((span:{kind:string;name:string})=>span.kind==='agent'&&span.name==='独立质检 Agent');
  const source=hr.input.messages[2].content.split('\n\n').slice(1).join('\n\n');
  const target=hr.input.messages.at(-1).content.split('\n\n').slice(1).join('\n\n');
  const diff=f6AuthorSourceDiff(f6ReviewHints(source,target,[]));
  expect(diff).toContain('- 江南理工大学（虚构院校）｜信息管理本科｜2019.09—2023.06');
  expect(diff).toContain('+ 中小电商客服系统。3 人');
  const request={...buildChatCompletionRequest(hr.input.messages,'stepfun','step-3.7-flash',hr.input.options),
    stream:true,stream_options:{include_usage:true}};
  const hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const ledger=JSON.parse(readFileSync(path.join(root!,'budget-readback.json'),'utf8'));
  expect(hash).toBe(ledger.calls[15].requestHash);
  const author=row.run.spans.filter((span:{kind:string;name:string})=>span.kind==='agent'&&span.name==='改稿 Agent').at(-1);
  const history=structuredClone(author.input.messages);
  let delivery;
  for(const message of history){
    if(message.role!=='tool')continue;
    const payload=JSON.parse(message.content);
    if(payload.hrReview){
      delivery=payload.executionState?.deliverables;
      payload.reviewContext.authorSourceDiff=diff;
      message.content=JSON.stringify(payload);
    }
  }
  const authorRequest=buildChatCompletionRequest(f6CallMessages(history,2,12,delivery),'stepfun','step-3.7-flash',
    {...author.input.options,resumeF6Tools:true,nativeTools:F6_MENTOR_TOOLS});
  const reserve=((Buffer.byteLength(JSON.stringify(authorRequest))+8192)*1.5+11596*9)/1e6;
  const record=JSON.parse(readFileSync(path.join(root!,'qa-recorded-prefix.json'),'utf8'));
  const prefix={...record,disclosure:'Two paid generation calls and the paid v19 HR commentary replayed explicitly; only original-author response is fresh.',
    entries:[...record.entries.slice(0,2),{sourceEval:task.delivery.evalRunId,sourceTrace:task.delivery.traceId,
      sourceSpan:hr.id,originalRequestSha256:hash,request,output:{content:hr.output},originalUsage:ledger.calls[15].usage}]};
  writeFileSync(path.join(root!,'qa-recorded-prefix-with-hr.json'),JSON.stringify(prefix,null,2),{mode:0o600});
  writeFileSync(path.join(root!,'attempt-6-author-diff-replay.json'),JSON.stringify({
    upstreamCalls:0,costCny:0,kind:'evidence_wiring_replay_not_semantic_acceptance',sourceEval:task.delivery.evalRunId,
    sourceTrace:task.delivery.traceId,sourceAndCandidateUnchanged:true,hrRequestHashVerified:hash,
    originalHrOutput:hr.output,readableAuthorDiff:diff,predictedWholeRequestUpperReservationCny:reserve,
    unchangedMaxOutputTokens:11596,semanticQualityRetested:false},null,2));
});
