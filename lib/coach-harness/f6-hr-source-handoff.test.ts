import {F6HrReviewSession} from './f6-hr-review';
import {f6ReviewHints} from './f6-review-hints';
import {f6ReviewReferences} from './f6-review-references';
import {f6CallMessages} from './f6-execution-state';
import {runF6ResumeWriter} from './resume-f6-writer';
import type {LlmMessage} from '@/lib/llm-tools';

// These arithmetic assertions describe this fixture's evidence, not a new
// production prose parser, numeric rule or fact fed to the original author.
const source='同一批120条问题，带引用且版本正确的回答从71条变成96条。每周看数据，发现重复提交后加了已有工单提醒。';
const candidate='同一批120条问题，带引用且版本正确的回答从71条提升至96条；据数据调整提交提醒。';
const wrongHr='提升25个百分点；“提升”和“据数据调整”没有原词依据。可以解释为知识库同步更新。';
const material={resume:source,jd:'产品经理',facts:'[]'};
const hints=()=>f6ReviewHints(source,candidate,[{id:'original',text:source}]);
const input={...material,facts:[],request:'',answers:[],decisions:[],scope:'whole' as const,format:{},mentorCoaching:true as const};
const write=(text:string)=>JSON.stringify({type:'native_tool_calls',tool_calls:[{
  id:'save',type:'function',function:{name:'write_output',arguments:JSON.stringify({files:[{name:'resume-new.md',text}]})},
}]});

test('UI lexical and derived-number notices remain in audit, never HR evidence authority',async()=>{
  const derived='重复催问每百单18次变成11次，下降约39%。';
  const original='重复催问每百单18次变成11次。';
  const raw=f6ReviewHints(original,derived,[{id:'original',text:original}]);
  expect(raw.passages.some(part=>part.notices.length>0)).toBe(true);
  const wire=f6ReviewReferences(original,derived,raw);
  expect(JSON.stringify(wire)).not.toContain('notices');
  expect(wire).not.toHaveProperty('noticeEvidence');
  const call=jest.fn().mockResolvedValue(wrongHr);
  const session=new F6HrReviewSession(material,call,hints);
  await session.inspect(candidate,1);
  expect(session.receipt().records[0].sourceComparison).toEqual(hints());
  expect(JSON.stringify(call.mock.calls[0][0])).not.toContain('wording_not_found');
  expect(96-71).toBe(25);
  expect((96-71)/120*100).toBeCloseTo(20.833333);
  expect((18-11)/18*100).toBeCloseTo(38.888889);
});

test('wrong HR numbers stay raw advice; trusted documents and saved receipt never acquire the claim',async()=>{
  const session=new F6HrReviewSession(material,async()=>wrongHr,hints);
  await session.inspect(candidate,1);
  const messages=session.authorHandoff(wrongHr,'沿用既有返修指令');
  const advice=JSON.parse(messages[0].content);
  expect(messages[0].role).toBe('assistant');
  expect(advice).toMatchObject({source:'independent_hr',authority:'unverified_advice_not_user_fact',hrReview:wrongHr});
  const host=JSON.parse(messages[1].content);
  expect(host).not.toHaveProperty('hrReview');
  expect(host).not.toHaveProperty('saved');
  expect(host.mechanical_review_hints.candidateSha256).toBe(advice.candidateSha256);
  const documents=messages.slice(2);
  expect(documents.map(m=>m.content.split('\n\n').slice(1).join('\n\n'))).toEqual([source,'[]',material.jd,candidate]);
  expect(documents.every(m=>!m.content.includes('25个百分点')&&!m.content.includes('知识库同步更新'))).toBe(true);
  const history:LlmMessage[]=[{role:'tool',tool_call_id:'save',content:'{"saved":["resume-new.md"]}'},...messages];
  const frozen=JSON.stringify(history);
  const next=f6CallMessages(history,2,12);
  expect(next[0]).toEqual(history[0]);
  expect(next[1]).toEqual(messages[0]);
  expect(JSON.stringify(history)).toBe(frozen);
  expect(session.receipt().records[0].commentary).toBe(wrongHr);
  expect(()=>session.authorHandoff('另一版点评','指令')).toThrow('F6_HR_HANDOFF_RECORD_MISMATCH');
});

test.each([false,true])('same original author can reject wrong HR advice, ordinary body=%s',async visible=>{
  const author=jest.fn().mockResolvedValueOnce(visible?candidate:write(candidate))
    .mockResolvedValueOnce('HR把条数差当成百分点，原材料没有知识库更新；不采纳这些建议。');
  const review=jest.fn().mockResolvedValue(wrongHr);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession(material,review,hints)));
  expect(author).toHaveBeenCalledTimes(2);expect(review).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(candidate);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
  expect(result.hrReview.authorResponse.text).toContain('不采纳');
  const next=author.mock.calls[1][0] as LlmMessage[];
  for(const m of next.filter(m=>m.role==='tool'))expect(JSON.parse(m.content)).not.toHaveProperty('hrReview');
  expect(next.find(m=>m.content.includes('"source":"independent_hr"'))?.role).toBe('assistant');
});

test('handoff reuses the actual reviewed source snapshot, not a mutable material object or caller-modified return value',async()=>{
  const supplied={...material};
  const review=new F6HrReviewSession(supplied,async()=>wrongHr,hints);
  await review.inspect(candidate,1);
  supplied.resume='后来换了另一份原稿';
  const first=review.authorHandoff(wrongHr,'既有职责');
  expect(first.some(m=>m.content==='核源文档 resume.md（不是新稿）\n\n'+source)).toBe(true);
  first[2].content='外部意外改动';
  const second=review.authorHandoff(wrongHr,'既有职责');
  expect(second.some(m=>m.content==='核源文档 resume.md（不是新稿）\n\n'+source)).toBe(true);
  expect(second.some(m=>m.content.includes('后来换了另一份原稿'))).toBe(false);
});
