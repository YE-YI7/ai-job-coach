import {isResumeEditingDirection,carryResumeProposals,readResumeRequestCoverage,resumeDeliverySummary} from './resume-edit-request';
import {currentResumeAnswer} from './resume-supplement';
import {parseResumeConversationDecision} from './resume-conversation-decision';
import type {ResumeAgentAnswer} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

const fact=(id:string,answer='我整理了需求清单')=>({id,claimId:id,sourceExcerpt:'这段原文说明整理需求',field:'action',question:'交付了什么？',answer,savedAt:'now'} as ResumeAgentAnswer);
const change=(id:string)=>({id,section:id,before:`${id} 原文`,after:`${id} 有依据的精简稿`,reason:'精简重复内容',evidenceIds:['fact'],status:'pending'} as ResumeChange);

test.each(['可以交给你了','还是要往产品经理那儿吧','保持一个简单的现状','保持现在的顺序','你来定'])('editorial direction is not a fact: %s',text=>{
  expect(isResumeEditingDirection(text)).toBe(true);
});
test.each(['我交付了达人对接方案','我保持每周核对需求清单','我负责产品定义、取舍与验收'])('actual work stays a fact: %s',text=>{
  expect(isResumeEditingDirection(text)).toBe(false);
});
test('a new edit request does not force repetition of the previous last metric',()=>{
  const old=fact('old','正向信号是点击率');
  const instruction={...fact('direction','调整开头定位，保持项目顺序'),kind:'instruction' as const};
  expect(currentResumeAnswer([old,instruction])).toBeNull();
  expect(currentResumeAnswer([old,instruction,fact('new')])?.claimId).toBe('new');
  expect(currentResumeAnswer([old,instruction,fact('permission','可以交给你了')])).toBeNull();
});
test('mentor revise decision survives dropping spurious permission supplements',()=>{
  const source='我负责产品定义、取舍与验收，与 AI 协作实现。';
  const turn={id:'user-turn',message:'可以交给你了',reply:'',status:'completed' as const,savedAt:'now'};
  const result=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'我会收紧开头，保留原有事实。',
    editorBrief:'把开头改为简洁的产品经理定位，不新增事实。',supplements:[{
      turnId:turn.id,quote:turn.message,sourceExcerpt:source,field:'action',
    }]}),source,[turn]);
  expect(result.action).toBe('revise');expect(result.supplement).toBeNull();
});
test('a bounded retry cannot lose other source-checked proposals',()=>{
  const carried=[change('opening'),change('project'),change('work')];
  const result=carryResumeProposals([{before:'work 原文',after:'work 修后',sourceIds:['fact']}],carried,[]);
  expect(result.map(item=>item.before)).toEqual(['work 原文','opening 原文','project 原文']);
  expect(result[0].after).toBe('work 修后');
  expect(result[1].sourceIds).toEqual(['fact']);
});
test('independently locked proposals survive without duplicate or over-budget changes',()=>{
  const locked=change('opening');
  const result=carryResumeProposals([{before:locked.before,after:'覆盖已锁定稿'},...Array.from({length:8},(_,i)=>({before:`新${i}`}))],[locked],[locked]);
  expect(result).toHaveLength(6);expect(result[0].after).toBe(locked.after);
});
test('missing and contradictory request coverage never mean complete',()=>{
  expect(readResumeRequestCoverage(undefined).status).toBe('unverified');
  expect(readResumeRequestCoverage({status:'complete',unaddressed:['开头'],summary:'正文尚未完成开头修改'}).status).toBe('unverified');
  expect(readResumeRequestCoverage({status:'partial',unaddressed:['开头'],summary:'只完成经历精简，开头尚未完成'}).status).toBe('partial');
});
test('receipt distinguishes saved suggestions from adopted document and names missing work',()=>{
  const text=resumeDeliverySummary([change('项目经历')],['开头定位']);
  expect(text).toContain('1 处待确认建议');expect(text).toContain('采纳后才会替换原文');
  expect(text).toContain('开头定位尚未完成');expect(text).not.toContain('修改稿已完成');
});
