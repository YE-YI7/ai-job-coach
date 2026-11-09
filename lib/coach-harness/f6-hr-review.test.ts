import {F6HrReviewSession,f6HrMessages,f6HrSummary} from './f6-hr-review';
import {runF6ResumeWriter,f6InitialMessages,F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';
import {F6_ORIGIN_TOOLS} from './f6-tool-session';

const input={resume:'参与评测，整理120条用例。',jd:'需要评测经验',facts:[{id:'f',text:'整理120条用例。'}],
  answers:[],decisions:[],request:'',scope:'whole' as const,format:{}};
const material={resume:input.resume,jd:input.jd,facts:'整理120条用例。'};
const first='主导评测，整理120条用例。',fixed='参与评测，整理120条用例。';
const tool=(name:string,args:unknown)=>JSON.stringify({type:'native_tool_calls',tool_calls:[{
  id:'call-'+name,type:'function',function:{name,arguments:JSON.stringify(args)},
}]});
const write=(text:string)=>tool('write_output',{files:[{name:'resume-new.md',text}]});
const commentary='「主导评测」与原材料「参与评测」责任不符，请核实。\n问题一？\n问题二？\n问题三？';

test('HR gets only four labeled documents, never author conversation or tools',()=>{
  const messages=f6HrMessages(material,first);
  expect(messages.map(m=>m.role)).toEqual(['system','user']);
  expect(JSON.parse(messages[1].content)).toEqual({
    'candidate.md':first,'resume.md':material.resume,'facts.md':material.facts,'jd.txt':material.jd,
  });
});
test.each([commentary,'建议保留；无需修改。','{"interviewQuestions":["一","二","三"]}'])
('any nonempty HR commentary goes verbatim to same author; no shape or question-count rejection',async raw=>{
  const author=jest.fn().mockResolvedValueOnce(write(first))
    .mockResolvedValueOnce(tool('read_file',{file:'resume.md'})).mockResolvedValueOnce(write(fixed));
  const review=jest.fn().mockResolvedValue(raw);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession(material,review)));
  expect(author).toHaveBeenCalledTimes(3);expect(review).toHaveBeenCalledTimes(1);
  expect(author.mock.calls[0][0]).toEqual(f6InitialMessages(input));
  expect(author.mock.calls[0][3]).toEqual(F6_ORIGIN_TOOLS);
  expect(author.mock.calls[1][0].slice(0,2)).toEqual(author.mock.calls[0][0]);
  const receipt=JSON.parse(author.mock.calls[1][0].at(-1).content);
  expect(receipt.saved).toEqual(['resume-new.md']);expect(receipt.hrReview).toBe(raw);
  expect(receipt.instruction).toContain('不是候选人事实');
  expect(result.fullDocument).toBe(fixed);
  expect(result.hrReview.finalState).toBe('author_revised_not_rechecked');
  expect(result.hrReview.records[0].commentary).toBe(raw);
});
test('author may reject HR suggestions and retain body; never called independently verified',async()=>{
  const review=jest.fn().mockResolvedValue('建议写主导，但这条建议也需要作者核实。');
  const author=jest.fn().mockResolvedValue(write(fixed));
  const session=new F6HrReviewSession(material,review);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,session));
  expect(author).toHaveBeenCalledTimes(2);expect(review).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(fixed);
  expect(session.finalState).toBe('author_retained_not_rechecked');
  expect(f6HrSummary(session.receipt())).toContain('不是审核通过');
});
test.each(['empty','network'])('HR %s failure preserves author text without retry',async mode=>{
  const review=jest.fn(async()=>{if(mode==='network')throw Error('timeout');return ' ';});
  const author=jest.fn().mockResolvedValue(write(first));
  const session=new F6HrReviewSession(material,review);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,session));
  expect(result.fullDocument).toBe(first);expect(session.finalState).toBe('hr_failed_body_preserved');
  expect(author).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
});
test('author limit includes initial writing and response; no 13th author call',async()=>{
  const author=jest.fn();
  for(let i=0;i<F6_MAX_AUTHOR_CALLS-1;i++)author.mockResolvedValueOnce(tool('read_file',{file:'resume.md'}));
  author.mockResolvedValueOnce(write(first));
  const session=new F6HrReviewSession(material,async()=>commentary);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,session));
  expect(author).toHaveBeenCalledTimes(F6_MAX_AUTHOR_CALLS);expect(result.fullDocument).toBe(first);
  expect(session.finalState).toBe('author_budget_exhausted');
});
test('malformed author response preserves initial body and labels incomplete, no retry',async()=>{
  const author=jest.fn().mockResolvedValueOnce(write(first)).mockResolvedValueOnce('{bad');
  const session=new F6HrReviewSession(material,async()=>commentary);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,session));
  expect(result.fullDocument).toBe(first);expect(result.hrReview.finalState).toMatch(/^repair_incomplete/);
});
test('ordinary visible author body supports same-author response',async()=>{
  const author=jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(fixed);
  const review=jest.fn().mockResolvedValue(commentary);
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession(material,review)));
  expect(result.fullDocument).toBe(fixed);expect(author.mock.calls[1][0].at(-1).role).toBe('user');
  expect(review).toHaveBeenCalledTimes(1);
});
test('H0a comparison without hook stays frozen',async()=>{
  const author=jest.fn().mockResolvedValue(write(fixed));
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{}));
  expect(result).not.toHaveProperty('hrReview');expect(author).toHaveBeenCalledTimes(1);
});
