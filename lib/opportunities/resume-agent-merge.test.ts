import {mergeResumeAgentChanges} from './resume-agent-merge';
import type {ResumeChange} from './types';
test('重改保留已采纳和已拒绝，只加入不重叠的新建议',()=>{
 const c=(id:string,before:string,status:ResumeChange['status']):ResumeChange=>({id,before,after:`新${before}`,status,section:'项目',reason:'精简',evidenceId:null});
 const previous=[c('a','第一处','accepted'),c('b','第二处','rejected'),c('c','第三处','pending')];
 expect(mergeResumeAgentChanges('第一处、第二处、第三处',previous,[c('x','第一处','pending'),c('y','第二处','pending'),c('z','第三处','pending')]).map(v=>[v.id,v.status])).toEqual([['a','accepted'],['b','rejected'],['z','pending']]);
});
