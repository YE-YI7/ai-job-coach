import {resumeConversationLocator,currentResumeConversationLocation} from './resume-conversation-location';
import {parseResumeConversationDecision,ResumeConversationEvidenceError} from './resume-conversation-decision';
import type {ResumeAgentTask} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

const before='我核对测试结果，与算法同事协作验收。';
const after='协同算法同事，核对失败样本并记录验收结果。';
const change:ResumeChange={id:'change-1',section:'项目',before,after,reason:'具体贡献',status:'pending',evidenceId:'source'};
const source={resume:'项目经历\n'+before+'\n技能\nSQL',changes:[change],revision:'revision-1'};
const task:ResumeAgentTask={id:'task',state:'ready',question:null,answers:[],updatedAt:'now',
  result:{changes:[change],resumeGenerationId:'task:1'}};
const turn={id:'user-turn',message:'我还整理了验收检查表，交给产品经理。',reply:'',status:'pending' as const,savedAt:'now'};
const raw=(supplement:unknown)=>JSON.stringify({action:'revise',reply:'准备把已确认的验收交付写清楚。',
  editorBrief:'只补这段的真实交付，不拔高责任。',supplements:[supplement]});
const fact={turnId:turn.id,quote:turn.message,field:'deliverable'};

test('explicit current-draft coordinates map through the editor, without becoming user evidence',()=>{
  const plan=parseResumeConversationDecision(raw({...fact,target:{document:'currentDraft',excerpt:after}}),
    source.resume,[turn],{...source,task});
  expect(plan.action).toBe('revise');
  expect(plan.supplement).toMatchObject({quote:turn.message,sourceExcerpt:before,location:{
    document:'currentDraft',quote:after,sourceRevision:source.revision,generationId:'task:1',changeIds:[change.id],
  }});
  expect(plan.supplement?.quote).not.toBe(after);
});

test('legacy decisions from a captured Trace can locate current text without changing their output',()=>{
  const plan=parseResumeConversationDecision(raw({...fact,sourceExcerpt:after}),source.resume,[turn],{...source,task});
  expect(plan.supplement).toMatchObject({sourceExcerpt:before,quote:turn.message,location:{quote:after}});
});

test('new original-document targets retain original provenance even with another current draft',()=>{
  const plan=parseResumeConversationDecision(raw({...fact,target:{document:'resume',excerpt:before}}),
    source.resume,[turn],{...source,task});
  expect(plan.supplement).toMatchObject({sourceExcerpt:before,location:{document:'resume',changeIds:[]}});
  expect(currentResumeConversationLocation(plan.supplement!.location!,source,task)).toBe(true);
});

test('mapping an excerpt across two edits keeps the complete original range, not guessed semantic similarity',()=>{
  const changes=[change,{...change,id:'change-2',before:'SQL',after:'SQL与数据分析'}];
  const mapped=resumeConversationLocator({...source,changes},task).resolve({
    document:'currentDraft',excerpt:after+'\n技能\nSQL与数据分析',
  },undefined);
  expect(mapped).toMatchObject({status:'found',sourceExcerpt:before+'\n技能\nSQL',
    location:{changeIds:['change-1','change-2']}});
});

test('unchanged text after a deletion keeps correct original offsets',()=>{
  const deleted={...change,after:''};
  const mapped=resumeConversationLocator({...source,changes:[deleted]},task).resolve({
    document:'currentDraft',excerpt:'技能\nSQL',
  },undefined);
  expect(mapped).toMatchObject({status:'found',sourceExcerpt:'技能\nSQL',
    location:{sourceStart:source.resume.indexOf('技能')}});
});

test('PDF whitespace normalization locates real current bytes, not a model-created replacement',()=>{
  const wrapped={...change,after:'协同算法同事,\n核对失败样本并记录验收结果。'};
  const mapped=resumeConversationLocator({...source,changes:[wrapped]},task).resolve({
    document:'currentDraft',excerpt:'协同算法同事，核对失败样本并记录验收结果。',
  },undefined);
  expect(mapped).toMatchObject({status:'found',sourceExcerpt:before,location:{quote:wrapped.after}});
});

test('a uniquely located AI invention still cannot be quoted as a new user fact',()=>{
  const invented={...change,after:'我带领五人团队实现收入增长200%。'};
  expect(()=>parseResumeConversationDecision(raw({...fact,quote:invented.after,
    target:{document:'currentDraft',excerpt:invented.after}}),source.resume,[turn],
    {...source,changes:[invented],task})).toThrow(ResumeConversationEvidenceError);
});

test.each([
  {document:'resume',excerpt:after},
  {document:'currentDraft',excerpt:'不存在的全新项目'},
  {document:'another-account',excerpt:after},
  {document:'currentDraft',excerpt:''},
])('invalid target %j is a technical handoff error, not a project question',target=>{
  expect(()=>parseResumeConversationDecision(raw({...fact,target}),source.resume,[turn],{...source,task}))
    .toThrow(ResumeConversationEvidenceError);
});

test('duplicate current passages never pick the first occurrence',()=>{
  const duplicate={...change,after:after+'\n'+after};
  const mapped=resumeConversationLocator({...source,changes:[duplicate]},task)
    .resolve({document:'currentDraft',excerpt:after},undefined);
  expect(mapped.status).toBe('invalid');
});

test('unresolved overlapping projection cannot be used as an editing target',()=>{
  const mapped=resumeConversationLocator({...source,changes:[change,{...change,id:'overlap'}]},task)
    .resolve({document:'currentDraft',excerpt:after},undefined);
  expect(mapped.status).toBe('invalid');
});

test.each(['rejected','manual','generation','source'] as const)('a %s update invalidates the saved current target',kind=>{
  const mapped=resumeConversationLocator(source,task).resolve({document:'currentDraft',excerpt:after},undefined);
  if(mapped.status!=='found'||!mapped.location)throw Error('fixture not located');
  const next={...source,changes:kind==='rejected'?[{...change,status:'rejected' as const}]
    :kind==='manual'?[{...change,after:'手写的新版本'}]:[change],
    ...(kind==='source'?{resume:source.resume+'\n新增经历'}:{})};
  const nextTask=kind==='generation'?{...task,result:{...task.result!,resumeGenerationId:'task:2'}}:task;
  expect(currentResumeConversationLocation(mapped.location,next,nextTask)).toBe(false);
});

test('jsonb key ordering does not invalidate an otherwise identical persisted location',()=>{
  const mapped=resumeConversationLocator(source,task).resolve({document:'currentDraft',excerpt:after},undefined);
  if(mapped.status!=='found'||!mapped.location)throw Error('fixture not located');
  const reordered=Object.fromEntries(Object.entries(mapped.location).reverse()) as typeof mapped.location;
  expect(currentResumeConversationLocation(reordered,source,task)).toBe(true);
  expect(currentResumeConversationLocation({...mapped.location,sourceStart:0},source,task)).toBe(false);
});

test('long current drafts still map only through real edit ranges',()=>{
  const padding='已有的背景信息保持不变。'.repeat(500);
  const long={...source,resume:padding+'\n'+source.resume};
  const mapped=resumeConversationLocator(long,task).resolve({document:'currentDraft',excerpt:after},undefined);
  expect(mapped).toMatchObject({status:'found',sourceExcerpt:before,
    location:{sourceStart:long.resume.indexOf(before)}});
});
