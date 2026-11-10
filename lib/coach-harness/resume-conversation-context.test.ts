import {resumeConversationMessages} from './resume-conversation-decision';
import {resumeConversationDraftContext} from './resume-conversation-context';
import {resumeInlineProjection} from '@/lib/opportunities/resume-inline';
import type {ResumeAgentTask} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

const original='项目经历\n与算法同事协作完成评测。\n技能\nSQL';
const changes:ResumeChange[]=[{id:'one',section:'项目经历',before:'与算法同事协作完成评测。',
  after:'协同算法同事制定测试集并验收。',reason:'具体交付',status:'pending',evidenceId:'fact'}];
const task:ResumeAgentTask={id:'task',state:'ready',question:null,answers:[],updatedAt:'now',
  result:{changes,resumeGenerationId:'task:2',f6Deliverables:{
    files:{'resume-new.md':'项目经历\n协同算法同事制定测试集并验收。\n技能\nSQL'},
    resumeRevision:1,renderedRevision:-1,mentorGuidance:{version:1,current:true,
      resumeRevision:1,text:'你如何确定测试范围？'},
  }}};

test('mentor receives the exact latest displayed clean draft with immutable-source identity',()=>{
  const source={resume:original,jd:'',changes,revision:'source-1'};
  const payload=JSON.parse(resumeConversationMessages(source,task).messages[1].content);
  expect(payload.resume).toBe(original);
  expect(payload.currentDraft).toMatchObject({sourceRevision:'source-1',generationId:'task:2',
    projectionStatus:'current',matchesLastGenerated:true,text:resumeInlineProjection(original,changes,false).text});
  expect(payload.currentDraft.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(payload.currentDraft.originalSha256).not.toBe(payload.currentDraft.sha256);
  expect(payload.mentorGuidance.text).toBe('你如何确定测试范围？');
  expect(payload.currentChanges).toEqual([{id:'one',section:'项目经历',status:'pending'}]);
});

test.each(['rejected','accepted'] as const)('user decision %s wins over stored AI file',status=>{
  const decided=changes.map(change=>({...change,status}));
  const payload=JSON.parse(resumeConversationMessages({resume:original,jd:'',changes:decided},task).messages[1].content);
  expect(payload.currentDraft.text || payload.resume).toBe(resumeInlineProjection(original,decided,false).text);
  if(status==='rejected'){
    expect(payload.currentDraft.matchesLastGenerated).toBe(false);
    expect(payload.mentorGuidance).toBeUndefined();
    expect(payload.previousMentorGuidance.text).toBe('你如何确定测试范围？');
  }else expect(payload.mentorGuidance.text).toBe('你如何确定测试范围？');
});

test('manual changes and not the old generated text define the current draft',()=>{
  const manual=changes.map(change=>({...change,after:'我核对错误样本并记录验收结果。'}));
  const context=resumeConversationDraftContext({resume:original,changes:manual},task);
  expect(context.text).toContain(manual[0].after);
  expect(context.matchesLastGenerated).toBe(false);
});

test('unlocatable or malformed edits are not falsely reported as a complete latest draft',()=>{
  for(const invalid of [[{...changes[0],before:'已经不存在的原句'}],[null]]){
    const payload=JSON.parse(resumeConversationMessages({resume:original,jd:'',changes:invalid},task).messages[1].content);
    expect(payload.currentDraft).toMatchObject({projectionStatus:'unresolved',text:null,sha256:null});
    expect(payload.currentDraft.findings.length).toBeGreaterThan(0);
    expect(payload.mentorGuidance).toBeUndefined();
  }
});

test('identical original/current text still has explicit provenance and no invented generation',()=>{
  const context=resumeConversationDraftContext({resume:original,changes:[]},
    {...task,result:undefined});
  expect(context).toMatchObject({projectionStatus:'current',text:original,generationId:null,matchesLastGenerated:null});
  expect(context.sha256).toBe(context.originalSha256);
  const payload=JSON.parse(resumeConversationMessages({resume:original,jd:'',changes:[]},
    {...task,result:undefined}).messages[1].content);
  expect(payload.currentDraft).toMatchObject({projectionStatus:'current',textReference:'resume'});
  expect(payload.currentDraft.text).toBeUndefined();
});

test('complete long drafts replace duplicate diff text instead of multiplying the context',()=>{
  const before='我收集反馈、核对案例与验收结果。'.repeat(150);
  const after='核对用户反馈与验收记录，整理失败案例。'.repeat(140);
  const edits=[{...changes[0],before,after}];
  const payload=JSON.parse(resumeConversationMessages({resume:before,jd:'',changes:edits},
    {...task,result:undefined}).messages[1].content);
  expect(payload.currentDraft.text).toBe(after);
  expect(JSON.stringify(payload.currentChanges).length).toBeLessThan(100);
  expect(JSON.stringify(payload).split(after).length-1).toBe(1);
  expect(JSON.stringify(payload).split(before).length-1).toBe(1);
});

test('ordinary user continuation receives actual pending and incomplete-review state, not a false quality certificate',()=>{
  const summary='独立 HR 点评（供核对，不是审核通过）\n原作者回应尚未完成，已保留已有稿件。';
  const source={resume:original,jd:'',changes};
  const messages=resumeConversationMessages(source,{...task,result:{...task.result!,summary}}).messages;
  const payload=JSON.parse(messages[1].content);
  expect(payload.currentDeliveryState).toMatchObject({pendingChanges:1,matchesLastGenerated:true,lastGenerationSummary:summary});
  expect(payload.currentDeliveryState.provenance).toContain('不是候选人事实或质量认证');
  expect(messages[0].content).toContain('不要把“用户想不起”');
  expect(messages[0].content).toContain('不因此新增一轮审核');
});
