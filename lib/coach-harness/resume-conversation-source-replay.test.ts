import fixture from './__fixtures__/resume-conversation-source-mixup.json';
import {parseResumeConversationDecision,resumeConversationMessages,ResumeConversationEvidenceError} from './resume-conversation-decision';
import {runResumeConversation} from './resume-conversation';
import {getDbClient} from '@/lib/db';
import {finalizeQuota,reserveQuota} from '@/lib/quota';
import {FakeDb} from './run-ledger/testing/fake-db';
import {observedResumeLLM} from './eval-observer';
import {claimResumeTask,readResumeTask,resumeTaskFingerprint} from './resume-task';
import type {ResumeAgentTask} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

jest.mock('@/lib/db');
jest.mock('./eval-observer',()=>({observedResumeLLM:jest.fn()}));
jest.mock('./workspace-eval',()=>({recordWorkspaceResume:jest.fn((_u,request,execute)=>execute(request)),workspaceEvalEnabled:()=>false}));
jest.mock('@/lib/auth',()=>({getCurrentUserFromRequest:jest.fn(async()=>({id:'owner'}))}));
jest.mock('@/lib/quota',()=>({reserveQuota:jest.fn(),finalizeQuota:jest.fn(),reserveFirstCoachingQuota:jest.fn()}));
const capturedTask=fixture.task as ResumeAgentTask;
const currentTurn=capturedTask.conversation!.at(-1)!;
const raw=fixture.rawDecision;
const original=JSON.parse(raw);
let db:FakeDb;
beforeEach(()=>{
  jest.clearAllMocks();
  db=new FakeDb({coach_opportunities:[{id:'opp',user_id:'owner',status:'active',jd_text:fixture.source.jd,
    metadata:{resumeText:fixture.source.resume,resumeRevision:fixture.source.revision,resumeChanges:fixture.source.changes}}],
  coach_resume_tasks:[{...structuredClone(capturedTask),user_id:'owner',opportunity_id:'opp',conversation:[],
    fingerprint:resumeTaskFingerprint(fixture.source.resume,fixture.source.jd,fixture.source.revision),
    version:3,lease_id:null,error:null}],
  interview_answers:[{id:'old',user_id:'real',answer:'原作答'}],
  watcha_wallets:[{user_id:'real',balance:99}],
  user_quotas:[{user_id:'real',paid_resume_remaining:7}],
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  (observedResumeLLM as jest.Mock).mockResolvedValue(raw);
  (reserveQuota as jest.Mock).mockResolvedValue({id:'test-reservation',source:'free_chat_daily',remaining:3});
  (finalizeQuota as jest.Mock).mockResolvedValue(true);
});

test('unchanged failed Trace output preserves the valid answer without making a source quotation a user fact',()=>{
  const plan=parseResumeConversationDecision(raw,fixture.source.resume,capturedTask.conversation!);
  expect(plan.action).toBe('revise');
  expect(plan.supplement).toEqual(original.supplements[0]);
  expect(plan.supplements).toBeUndefined();
  expect(plan.sourceReferences).toEqual([{source:'resume',quote:original.supplements[1].quote,
    sourceExcerpt:original.supplements[1].sourceExcerpt,attemptedTurnId:currentTurn.id}]);
  const payload=JSON.parse(resumeConversationMessages(fixture.source,capturedTask).messages[1].content);
  expect(payload.currentDraft.text).toBe(capturedTask.result!.f6Deliverables!.files['resume-new.md']);
  expect(payload.currentDraft.text).not.toContain('带 1 名');
  expect(payload.resume).toContain('有一名算法和两名后端一起做');
});

test('actual route, receipt persistence, editor lease and refresh replay the failed output without another mentor call',async()=>{
  const revise=jest.fn(async(messageId:string)=>{
    const claimed=await claimResumeTask('owner','opp',{action:'conversation',messageId});
    expect(claimed.claimed).toBe(true);
    return claimed.task;
  });
  const request=()=>new Request('https://example.com/api/coach/resume-agent',{method:'POST'});
  const body={opportunityId:'opp',requestId:currentTurn.id,answer:currentTurn.message};
  const response=await runResumeConversation(request(),{id:'owner'},body,revise);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ok:true,conversationDecision:'revise'});
  expect(revise).toHaveBeenCalledTimes(1);
  expect(finalizeQuota).toHaveBeenCalledWith(expect.objectContaining({id:'test-reservation'}),true);
  const refreshed=await readResumeTask('owner','opp');
  expect(refreshed?.conversation?.at(-1)).toMatchObject({message:currentTurn.message,status:'completed',decision:'revise'});
  const facts=refreshed!.answers.filter(answer=>answer.kind!=='instruction');
  expect(facts).toHaveLength(1);
  expect(facts[0].answer).toBe(currentTurn.message);
  expect(facts.some(answer=>answer.answer===original.supplements[1].quote)).toBe(false);
  expect(refreshed!.result!.f6Deliverables!.files['resume-new.md'])
    .toBe(capturedTask.result!.f6Deliverables!.files['resume-new.md']);
  expect((await runResumeConversation(request(),{id:'owner'},body,revise)).status).toBe(200);
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);
  expect(revise).toHaveBeenCalledTimes(1);
  expect(db.rows('interview_answers')).toEqual([{id:'old',user_id:'real',answer:'原作答'}]);
  expect(db.rows('watcha_wallets')).toEqual([{user_id:'real',balance:99}]);
  expect(db.rows('user_quotas')).toEqual([{user_id:'real',paid_resume_remaining:7}]);
});

test('unknown claims, missing users, wrong anchors and invalid fields still cannot become facts',()=>{
  const item=original.supplements[1];
  for(const bad of [
    {...item,quote:'我独立训练模型并带来收入增长100%'},
    {...item,turnId:'another-user'},
    {...item,sourceExcerpt:'原文不存在的项目'},
    {...item,field:'untrusted'},
  ])expect(()=>parseResumeConversationDecision(JSON.stringify({...original,supplements:[original.supplements[0],bad]}),
    fixture.source.resume,capturedTask.conversation!)).toThrow(ResumeConversationEvidenceError);
});

test('unverifiable handoff saves the answer as discussion, never dispatches its untrusted brief or auto-retries',async()=>{
  const bad={...original,supplements:[{...original.supplements[0],quote:'我主导团队收入翻倍'}]};
  (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify(bad));
  const revise=jest.fn(),preview=jest.fn();
  const response=await runResumeConversation(new Request('https://example.com/api/coach/resume-agent',{method:'POST'}),
    {id:'owner'},{opportunityId:'opp',requestId:currentTurn.id,answer:currentTurn.message},revise,preview);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({conversationDecision:'discuss'});
  expect(revise).not.toHaveBeenCalled();
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);
  const refreshed=await readResumeTask('owner','opp');
  expect(refreshed?.conversation?.at(-1)).toMatchObject({status:'completed',message:currentTurn.message,decision:'discuss'});
  expect(refreshed?.answers).toEqual([]);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(preview.mock.calls[0][0]).toContain('没有执行新修改');
  expect(preview.mock.calls[0][0]).not.toContain(original.reply);
  expect(finalizeQuota).toHaveBeenCalledWith(expect.objectContaining({id:'test-reservation'}),false);
  expect(finalizeQuota).toHaveBeenCalledTimes(1);
});

test('newer user rejection is reflected in next input rather than an old F6 file or its active guidance',()=>{
  const changes=fixture.source.changes.map(change=>({...change,status:'rejected'})) as ResumeChange[];
  const payload=JSON.parse(resumeConversationMessages({...fixture.source,changes},capturedTask).messages[1].content);
  expect(payload.currentDraft.textReference).toBe('resume');
  expect(payload.resume).toBe(fixture.source.resume);
  expect(payload.currentDraft.matchesLastGenerated).toBe(false);
  expect(payload.mentorGuidance).toBeUndefined();
  expect(payload.previousMentorGuidance).toBeDefined();
});

test('another account cannot read the task, send a mentor message or claim an editor',async()=>{
  const revise=jest.fn();
  await expect(runResumeConversation(new Request('https://example.com/api/coach/resume-agent',{method:'POST'}),
    {id:'other'},{opportunityId:'opp',requestId:currentTurn.id,answer:currentTurn.message},revise))
    .rejects.toThrow('不可访问');
  expect(observedResumeLLM).not.toHaveBeenCalled();
  expect(reserveQuota).not.toHaveBeenCalled();
  expect(revise).not.toHaveBeenCalled();
  expect(db.rows('coach_resume_tasks')[0].conversation).toEqual([]);
});

test('a concurrent update after the model returns cannot commit the old decision or invoke editing',async()=>{
  (observedResumeLLM as jest.Mock).mockImplementation(async()=>{
    const row=db.rows('coach_resume_tasks')[0];
    row.version=Number(row.version)+1;
    return raw;
  });
  const revise=jest.fn();
  const response=await runResumeConversation(new Request('https://example.com/api/coach/resume-agent',{method:'POST'}),
    {id:'owner'},{opportunityId:'opp',requestId:currentTurn.id,answer:currentTurn.message},revise);
  expect(response.status).toBe(409);
  expect(revise).not.toHaveBeenCalled();
  expect((await readResumeTask('owner','opp'))?.conversation?.at(-1)?.message).toBe(currentTurn.message);
  expect((await readResumeTask('owner','opp'))?.answers).toEqual([]);
});
