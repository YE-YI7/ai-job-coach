import {annotateF6Changes,f6DeliveryChanges,f6EvidenceNotices} from './resume-f6-delivery';
import {f6DocumentSafetyIssues} from './resume-f6-preflight';
import {applyResumeChanges} from './application-quality';
import {decideResumeChanges} from '@/lib/opportunities/resume-agent-merge';
import {resumeInlineProjection} from '@/lib/opportunities/resume-inline';

const source='李青\n\n参与整理评测记录。\n\n## 技能\nSQL、Excel。';
const sources=[{id:'original',text:source}];
test('new number and stronger responsibility become exact, non-blocking notices',()=>{
  const candidate='主导整理评测记录，覆盖 500 人并已上线。';
  const notices=f6EvidenceNotices(candidate,sources);
  expect(notices.some(n=>n.quote.includes('500'))).toBe(true);
  expect(notices.some(n=>n.quote==='主导')).toBe(true);
  expect(notices.some(n=>n.quote==='上线')).toBe(true);
  for(const notice of notices)expect(candidate.slice(notice.start,notice.end)).toBe(notice.quote);
  expect(f6DocumentSafetyIssues(source,source.replace('参与整理评测记录。',candidate))).toEqual([]);
});
test('calendar precision and thousands formatting do not generate known format false positives',()=>{
  const facts=[{id:'a',text:'2026 年 6 月毕业。标注集 1200 条。负责整理 50 人反馈。'}];
  expect(f6EvidenceNotices('2026 校招，标注集 1,200 条，整理 50 人反馈。',facts)).toEqual([]);
  expect(f6EvidenceNotices('2026.07 毕业，标注集 1,201 条，整理 500 人反馈。',facts)
    .filter(n=>n.code==='number_not_found').map(n=>n.quote)).toEqual(['2026.07','1,201 条','500 人']);
});
test('list ordinals are structural; unsupported factual numbers remain notices',()=>{
  const notices=f6EvidenceNotices('1. 完成 500 条标注。\n2. 整理记录。',sources);
  expect(notices.filter(n=>n.code==='number_not_found').map(n=>n.quote)).toEqual(['500 条']);
});
test('identity/contact remains protected, not turned into a content-quality pass',()=>{
  const input='李青\n邮箱：li@example.test\n\n项目：整理记录。';
  expect(f6DocumentSafetyIssues(input,input.replace('李青','张林'))).not.toEqual([]);
  expect(f6DocumentSafetyIssues(input,input.replace('li@example.test','other@example.test'))).not.toEqual([]);
});
test('skill reordering cannot discard other document changes; exact source and scope still enforced',()=>{
  const raw=[{before:'参与整理评测记录。',after:'主导整理评测记录，覆盖500人。',sourceIds:['own']},
    {before:'SQL、Excel。',after:'Excel、SQL。',sourceIds:['own']}];
  const options={allowedIds:new Set(['own']),idFor:(_:string,i:number)=>'change-'+i};
  const result=f6DeliveryChanges(source,raw,options);
  expect(result.rejected).toEqual([]);expect(result.changes).toHaveLength(2);
  const changes=annotateF6Changes(result.changes,sources);
  expect(changes[0].evidenceNotices?.length).toBeGreaterThan(0);
  expect(applyResumeChanges(source,changes).findings).toEqual([]);
  const roundtrip=JSON.parse(JSON.stringify(changes));
  expect(roundtrip).toEqual(changes);
  expect(applyResumeChanges(source,decideResumeChanges(roundtrip,changes[0].id,'accepted')).text).toContain('500人');
  expect(applyResumeChanges(source,decideResumeChanges(roundtrip,changes[0].id,'rejected')).text).toContain('参与整理评测记录。');
  expect(f6DeliveryChanges(source,[{before:'别人的原文',after:'任意'}],options).rejected).toHaveLength(1);
  expect(f6DeliveryChanges(source,raw,{...options,inScope:()=>false}).rejected).toHaveLength(2);
});
test('unknown evidence has yellow ink in the actual projection and does not leak when marks are hidden',()=>{
  const after='整理500人反馈。';
  const changes=annotateF6Changes([{id:'a',before:'参与整理评测记录。',after,section:'项目',reason:'候选',
    evidenceId:null,status:'pending'}],sources);
  const shown=resumeInlineProjection(source,changes,true);
  const warning=changes[0].evidenceNotices!.find(n=>n.code==='number_not_found')!;
  expect(shown.ink.some(ink=>ink.kind==='reworded'&&shown.text.slice(ink.start,ink.end).includes(warning.quote))).toBe(true);
  expect(resumeInlineProjection(source,changes,false).ink).toEqual([]);
  expect(resumeInlineProjection(source,changes,false).text).toContain(after);
});
test('a changed number containing a retained digit is one continuous yellow mark, not three focus stops',()=>{
  const before='整理120条测试用例。',after='整理500条测试用例。';
  const changes=annotateF6Changes([{id:'number',before,after,section:'项目',reason:'待确认',evidenceId:null,status:'pending'}],
    [{id:'original',text:before}]);
  const shown=resumeInlineProjection(before,changes,true);
  expect(shown.ink.some(ink=>ink.kind==='reworded'&&shown.text.slice(ink.start,ink.end)==='500条')).toBe(true);
});
