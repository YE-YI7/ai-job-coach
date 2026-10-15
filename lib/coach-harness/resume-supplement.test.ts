import {coversCurrentResumeAnswer} from './resume-supplement';
import type {ResumeAgentAnswer} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';
const answer=(claimId:string,sourceExcerpt:string)=>({claimId,sourceExcerpt,answer:'我交付了清单',field:'action',question:'你具体做了什么？',id:claimId,savedAt:'now'} as ResumeAgentAnswer);
const change=(id:string,before:string)=>({id,before,after:'整理清单',evidenceIds:[id],evidenceId:id,reason:'精简',section:'经历',status:'pending'} as ResumeChange);
test('旧回答被引用不能冒充最新补充已经进入稿子',()=>{
 const answers=[answer('a','第一段原文'),answer('b','第二段原文')];
 expect(coversCurrentResumeAnswer([change('a','第一段原文')],answers)).toBe(false);
 expect(coversCurrentResumeAnswer([change('b','第一段原文')],answers)).toBe(false);
 expect(coversCurrentResumeAnswer([change('b','第二段原文')],answers)).toBe(true);
});
test('不知道或跳过不强迫重新引用之前的回答',()=>{
 expect(coversCurrentResumeAnswer([], [answer('a','第一段'),{...answer('b','第二段'),answer:'不知道'}])).toBe(true);
 expect(coversCurrentResumeAnswer([], [{...answer('b','第二段'),skipped:true}])).toBe(true);
});
test('仅否定责任的回答作为约束保留，不强迫复制到正文；正向动作仍必须交付',()=>{
 expect(coversCurrentResumeAnswer([], [{...answer('b','第二段'),answer:'我没有负责开发上线，也没有统计人数。'}])).toBe(true);
 expect(coversCurrentResumeAnswer([], [{...answer('b','第二段'),answer:'我没有负责开发。我整理了需求清单。'}])).toBe(false);
});
