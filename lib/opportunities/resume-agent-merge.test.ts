import {mergeResumeAgentChanges,decideResumeChange} from './resume-agent-merge';
import type {ResumeChange} from './types';
test('重改保留已采纳和已拒绝，只加入不重叠的新建议',()=>{
 const c=(id:string,before:string,status:ResumeChange['status']):ResumeChange=>({id,before,after:`新${before}`,status,section:'项目',reason:'精简',evidenceId:null});
 const previous=[c('a','第一处','accepted'),c('b','第二处','rejected'),c('c','第三处','pending')];
 expect(mergeResumeAgentChanges('第一处、第二处、第三处',previous,[c('x','第一处','pending'),c('y','第二处','pending'),c('z','第三处','pending')]).map(v=>[v.id,v.status])).toEqual([['a','accepted'],['b','rejected'],['z','pending']]);
});
test('针对已采纳段落的最新补充可产生下一版，拒绝则还原上次采纳内容',()=>{
 const old:ResumeChange={id:'old',before:'参与项目，整理资料',after:'整理项目资料清单',status:'accepted',section:'项目',reason:'旧改稿',evidenceId:null};
 const next={...old,id:'next',after:'整理项目资料清单，交付给研发评审',status:'pending' as const};
 expect(mergeResumeAgentChanges(old.before,[old],[next])).toEqual([old]);
 const merged=mergeResumeAgentChanges(old.before,[old],[next],[old.before]);
 expect(merged).toHaveLength(1);expect(merged[0].previousDecision?.after).toBe(old.after);
 expect(decideResumeChange(merged[0],'rejected')).toMatchObject({after:old.after,status:'accepted'});
 expect(decideResumeChange(merged[0],'accepted')).toMatchObject({after:next.after,status:'accepted'});
});
