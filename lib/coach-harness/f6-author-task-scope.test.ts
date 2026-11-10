import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {f6HrResponseInstruction,F6_HR_AUTHOR_SCOPE,F6_HR_REPAIR_INSTRUCTION} from './f6-hr-review';
import {F6_MENTOR_HR_RESPONSE_CHANNELS} from './f6-mentor-guidance';
import {buildChatCompletionRequest} from '@/lib/llm';
import {F6_MENTOR_TOOLS} from './f6-output-channels';

test('one HR call does not shrink original author responsibility to only HR-selected topics',()=>{
  const instruction=f6HrResponseInstruction(F6_MENTOR_HR_RESPONSE_CHANNELS);
  expect(instruction).not.toContain('本次只回应这一轮点评');
  expect(instruction).toContain(F6_HR_AUTHOR_SCOPE);
  expect(instruction).toContain('不以HR提到哪些问题来缩小检查范围');
  expect(f6HrResponseInstruction()).toBe(F6_HR_REPAIR_INSTRUCTION);
});

const root=process.env.F6_COVERAGE_REPLAY;
(root?test:test.skip)('rebuild actual v20 request and change only post-HR task scope, preserving all paid evidence',()=>{
  const task=JSON.parse(readFileSync(path.join(root!,'attempt-7-task-initial.json'),'utf8')).task;
  const row=JSON.parse(readFileSync(path.join(root!,'attempt-7-coach_eval_runs-initial.json'),'utf8'))
    .find((item:{id:string})=>item.id===task.delivery.evalRunId);
  const span=row.run.spans.filter((item:{kind:string;name:string})=>item.kind==='agent'&&item.name==='改稿 Agent').at(-1);
  const recorded=JSON.parse(readFileSync(path.join(root!,'qa-recorded-prefix-with-hr.json'),'utf8'));
  const calls=new Map();
  for(const entry of recorded.entries)for(const call of entry.output.tool_calls||[])calls.set(call.id,call);
  const messages=span.input.messages.map((message:{role:string;content:string;tool_call_id?:string;tool_calls?:Array<{id:string}>})=>
    message.role==='tool'?{role:message.role,tool_call_id:message.tool_call_id,content:message.content}
      :{role:message.role,content:message.content,
        ...(message.tool_calls?{tool_calls:message.tool_calls.map(call=>calls.get(call.id)||call)}:{})});
  const options={...span.input.options,resumeF6Tools:true,nativeTools:F6_MENTOR_TOOLS};
  const old=buildChatCompletionRequest(messages,'stepfun','step-3.7-flash',options);
  const hash=createHash('sha256').update(JSON.stringify(old)).digest('hex');
  const ledger=JSON.parse(readFileSync(path.join(root!,'budget-readback.json'),'utf8'));
  expect(hash).toBe(ledger.calls[17].requestHash);
  let changed=0;
  for(const message of messages){
    if(message.role!=='tool')continue;
    const payload=JSON.parse(message.content);
    if(typeof payload.hrReview==='string'){
      expect(payload.instruction.endsWith('本次只回应这一轮点评，不再额外复审。')).toBe(true);
      payload.instruction=payload.instruction.replace('本次只回应这一轮点评，不再额外复审。',F6_HR_AUTHOR_SCOPE);
      message.content=JSON.stringify(payload);changed++;
    }
  }
  expect(changed).toBe(1);
  const request=buildChatCompletionRequest(messages,'stepfun','step-3.7-flash',options);
  writeFileSync(path.join(root!,'v21-author-request-rehearsal.json'),JSON.stringify(request,null,2),{mode:0o600});
  writeFileSync(path.join(root!,'attempt-7-scope-conflict-replay.json'),JSON.stringify({
    kind:'recorded_request_scope_replay_not_quality',upstreamCalls:0,costCny:0,
    sourceEval:task.delivery.evalRunId,sourceTrace:task.delivery.traceId,oldRequestHashVerified:hash,
    changedMessageCount:changed,changedField:'post-HR instruction terminal responsibility scope only',
    hrCommentaryAndSourceDiffUnchanged:true,b05SystemAndToolsUnchanged:true,
    newRequestSha256:createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    semanticQualityRetested:false},null,2));
});
