import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {F6HrReviewSession} from './f6-hr-review';
import {runF6ResumeWriter,f6InitialMessages} from './resume-f6-writer';
import {expandEvalTranscript} from './eval-transcript-storage';
import {f6ReviewHints} from './f6-review-hints';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const source='李青\n与算法同事协作，完成12家试点。';
const body='李青\n与算法同事协作完成12家试点验证。';
const coaching='你可以说：我记得12家是随机抽的。';
const input={resume:source,jd:'产品经理',facts:[],answers:[],decisions:[],request:'',
  scope:'whole' as const,format:{},mentorCoaching:true as const};
const write=(text:string,guide?:string)=>JSON.stringify({type:'native_tool_calls',tool_calls:[{
  id:'save',type:'function',function:{name:'write_output',arguments:JSON.stringify({files:[
    {name:'resume-new.md',text},...(guide?[{name:'mentor.md',text:guide}]:[]),
  ]})},
}]});
const handoff=(messages:Array<{content:string}>)=>JSON.parse(messages.find(m=>m.content.includes('"source":"host_review_handoff"'))!.content);

test('the same existing HR sees current user-visible coaching as unconfirmed material, not a new fact',async()=>{
  const hr=jest.fn().mockResolvedValue('辅导中随机抽样无出处，请核实。');
  const author=jest.fn().mockResolvedValueOnce(write(body,coaching))
    .mockResolvedValueOnce(write(body,'这12家如何选的？记不清可只保留已知试点范围。'));
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession({resume:source,jd:input.jd,facts:''},hr)));
  expect(hr).toHaveBeenCalledTimes(1);expect(author).toHaveBeenCalledTimes(2);
  const context=JSON.parse(hr.mock.calls[0][0][1].content).mechanical_review_hints;
  expect(context).toMatchObject({candidateSha256:hash(body),sourceSha256:hash(source),
    coaching:{document:'mentor.md',text:coaching,sha256:hash(coaching),resumeRevision:1}});
  expect(handoff(author.mock.calls[1][0]).mechanical_review_hints).toEqual(context);
  expect(hr.mock.calls[0][0][0].content).toContain('不是候选人事实');
  expect(hr.mock.calls[0][0][0].content).toContain('不能用业务规模替代本人责任');
  expect(result.f6Deliverables.mentorGuidance.text).not.toContain('我记得');
  expect(result.fullDocument).toBe(body);
});

test.each([false,true])('stale guidance never becomes current HR evidence (revised=%s)',async revised=>{
  const hr=jest.fn().mockResolvedValue('自然语言点评，不做解析。');
  const session=new F6HrReviewSession({resume:source,jd:'',facts:''},hr);
  await session.inspect(body,2,{text:coaching,resumeRevision:revised?0:1,current:false});
  expect(session.reviewContext()).toBeUndefined();
  expect(JSON.parse(hr.mock.calls[0][0][1].content)).not.toHaveProperty('mechanical_review_hints');
});

test('HR failure preserves the exact candidate and coaching capture; no semantic parser, retry or automatic fix',async()=>{
  const hr=jest.fn().mockRejectedValue(new Error('network'));
  const session=new F6HrReviewSession({resume:source,jd:'',facts:''},hr);
  const result=JSON.parse(await runF6ResumeWriter(input,jest.fn().mockResolvedValue(write(body,coaching)),
    ()=>{},undefined,undefined,undefined,session));
  expect(result.fullDocument).toBe(body);expect(hr).toHaveBeenCalledTimes(1);
  expect(session.receipt().records[0].reviewContext?.coaching?.text).toBe(coaching);
  expect(session.finalState).toBe('hr_failed_body_preserved');
});

const privateReplay=process.env.F6_COACHING_REPLAY_DIR?test:test.skip;
privateReplay('actual v13 outputs replay byte-for-byte; newly wired coaching reaches the same HR and original author',async()=>{
  const dir=process.env.F6_COACHING_REPLAY_DIR!;
  const rows=JSON.parse(readFileSync(dir+'/attempt-2-coach_eval_runs-final.json','utf8'));
  const archived=rows.find((row:{id:string})=>row.id==='4cc71305-d721-47f4-b647-90c2823bdeff');
  const expanded=expandEvalTranscript(archived.run) as {spans:Array<{kind:string;name:string;input:{messages?:Array<{content:string}>};output:unknown}>};
  const initial=expanded.spans.find(span=>span.input?.messages&&span.name==='材料与上下文'&&span.input.messages.length===2)!;
  const payload=JSON.parse(initial.input.messages![1].content);
  const fixtureInput={resume:payload['resume.md'],jd:payload['jd.txt'],facts:payload['facts.md'],
    request:payload.editingRequest,answers:payload.answers,decisions:payload.priorDecisions,
    scope:'whole' as const,format:{},mentorCoaching:true as const};
  expect(f6InitialMessages(fixtureInput)).toEqual(initial.input.messages);
  const authorOutputs=expanded.spans.filter(span=>span.kind==='agent'&&span.name==='改稿 Agent'&&typeof span.output==='string');
  const hrOutput=expanded.spans.find(span=>span.kind==='agent'&&span.name==='独立质检 Agent')!.output as string;
  const author=jest.fn();authorOutputs.forEach(span=>author.mockResolvedValueOnce(span.output));
  author.mockRejectedValueOnce(new Error('archived pre-call budget refusal; no new upstream'));
  const hr=jest.fn().mockResolvedValue(hrOutput);
  const result=JSON.parse(await runF6ResumeWriter(fixtureInput,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession({resume:fixtureInput.resume,jd:fixtureInput.jd,facts:JSON.stringify(fixtureInput.facts)},hr,
      text=>f6ReviewHints(fixtureInput.resume,text,[{id:'original',text:fixtureInput.resume}]))));
  const originalTask=JSON.parse(readFileSync(dir+'/attempt-2-task-initial.json','utf8')).task;
  const originalFiles=originalTask.result.f6Deliverables.files;
  expect(result.fullDocument).toBe(originalFiles['resume-new.md']);
  expect(result.f6Deliverables.files['mentor.md']).toBe(originalFiles['mentor.md']);
  const context=JSON.parse(hr.mock.calls[0][0][1].content).mechanical_review_hints;
  expect(context.coaching.text).toBe(originalFiles['mentor.md']);
  expect(handoff(author.mock.calls[2][0]).mechanical_review_hints).toEqual(context);
  expect(hr).toHaveBeenCalledTimes(1);expect(author).toHaveBeenCalledTimes(3);
  writeFileSync(dir+'/v14-actual-trace-replay.json',JSON.stringify({kind:'zero_fee_recorded_output_wiring_replay',
    originalEvalId:archived.id,newModelCalls:0,costCny:0,initialMessagesIdentical:true,
    badBodyBytePreserved:true,badGuidanceBytePreserved:true,coachingReachedExistingHrAndSameAuthor:true,
    hrInput:hr.mock.calls[0][0],authorInput:author.mock.calls[2][0],
    qualityVerdict:'not_retested_recorded_bad_outputs_still_bad'},null,2)+'\n');
});
