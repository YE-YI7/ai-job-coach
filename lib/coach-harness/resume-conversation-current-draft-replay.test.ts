import fixture from './__fixtures__/resume-conversation-current-draft-anchor.json';
import {parseResumeConversationDecision,resumeConversationMessages} from './resume-conversation-decision';
import {runResumeConversation} from './resume-conversation';
import {getDbClient} from '@/lib/db';
import {finalizeQuota,reserveQuota} from '@/lib/quota';
import {FakeDb} from './run-ledger/testing/fake-db';
import {observedResumeLLM} from './eval-observer';
import {
  claimResumeTask,readResumeTask,resumeTaskFingerprint,beginResumeMessage,completeResumeMessage,
  resumeTaskInput,persistResumeAnswerClaims,
} from './resume-task';
import type {ResumeAgentTask} from './resume-task-types';

jest.mock('@/lib/db');
jest.mock('./eval-observer',()=>({observedResumeLLM:jest.fn()}));
jest.mock('./workspace-eval',()=>({recordWorkspaceResume:jest.fn((_u,request,execute)=>execute(request)),workspaceEvalEnabled:()=>false}));
jest.mock('@/lib/auth',()=>({getCurrentUserFromRequest:jest.fn(async()=>({id:'owner'}))}));
jest.mock('@/lib/quota',()=>({reserveQuota:jest.fn(),finalizeQuota:jest.fn(),reserveFirstCoachingQuota:jest.fn()}));
const captured=fixture.task as ResumeAgentTask,turn=captured.conversation!.at(-1)!;
const parsed=JSON.parse(fixture.rawDecision);
const request=()=>new Request('https://example.com/api/coach/resume-agent',{method:'POST'});
const body={opportunityId:'opp',requestId:turn.id,answer:turn.message};
let db:FakeDb;
beforeEach(()=>{
  jest.clearAllMocks();
  db=new FakeDb({coach_opportunities:[{id:'opp',user_id:'owner',status:'active',jd_text:fixture.source.jd,
    metadata:{resumeText:fixture.source.resume,resumeRevision:fixture.source.revision,resumeChanges:fixture.source.changes}}],
  coach_resume_tasks:[{...structuredClone(captured),user_id:'owner',opportunity_id:'opp',conversation:[],
    fingerprint:resumeTaskFingerprint(fixture.source.resume,fixture.source.jd,fixture.source.revision),
    version:3,lease_id:null,error:null}],
  interview_answers:[{id:'old',user_id:'real',answer:'原作答'}],
  watcha_wallets:[{user_id:'real',balance:99}],user_quotas:[{user_id:'real',paid_resume_remaining:7}],
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  (observedResumeLLM as jest.Mock).mockResolvedValue(fixture.rawDecision);
  (reserveQuota as jest.Mock).mockResolvedValue({id:'qa-reservation',source:'free_chat_daily',remaining:3});
  (finalizeQuota as jest.Mock).mockResolvedValue(true);
});

test('the unchanged v10 failed output now keeps revise, exact user evidence and original-source placement',()=>{
  const plan=parseResumeConversationDecision(fixture.rawDecision,fixture.source.resume,captured.conversation!,
    {...fixture.source,task:captured});
  expect(plan.action).toBe('revise');
  expect(plan.reply).not.toContain('哪一段实习或项目');
  expect(plan.supplement?.quote).toBe(parsed.supplements[0].quote);
  expect(fixture.source.resume).toContain(plan.supplement!.sourceExcerpt);
  expect(plan.supplement?.location).toMatchObject({document:'currentDraft',quote:parsed.supplements[0].sourceExcerpt});
  const payload=JSON.parse(resumeConversationMessages(fixture.source,captured).messages[1].content);
  expect(payload.currentDraft.text).toContain(parsed.supplements[0].sourceExcerpt);
  expect(payload.resume).not.toContain(parsed.supplements[0].sourceExcerpt);
  expect(plan.sourceReferences).toBeUndefined();
});

test('actual route saves, claims the existing editor once, and refreshes without converting current text into facts',async()=>{
  const revise=jest.fn(async(messageId:string)=>{
    const claimed=await claimResumeTask('owner','opp',{action:'conversation',messageId});
    expect(claimed.claimed).toBe(true);
    const worker=await resumeTaskInput('owner',claimed.task.id,claimed.lease!);
    const claims=await persistResumeAnswerClaims(worker);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({value:parsed.supplements[0].quote,
      sourceExcerpt:parsed.supplements[0].quote,sourceKind:'user_statement',verificationLevel:'self_reported'});
    expect(JSON.stringify(db.rows('coach_claims'))).not.toContain(parsed.supplements[0].sourceExcerpt);
    return claimed.task;
  });
  const response=await runResumeConversation(request(),{id:'owner'},body,revise);
  expect(await response.json()).toMatchObject({ok:true,conversationDecision:'revise'});
  expect(revise).toHaveBeenCalledTimes(1);
  const refreshed=await readResumeTask('owner','opp');
  expect(refreshed?.conversation?.at(-1)).toMatchObject({decision:'revise',status:'completed',message:turn.message});
  const facts=refreshed!.answers.filter(a=>a.kind!=='instruction');
  expect(facts).toHaveLength(1);
  expect(facts[0].answer).toBe(parsed.supplements[0].quote);
  expect(facts[0].editLocation?.document).toBe('currentDraft');
  expect(fixture.source.resume).toContain(facts[0].sourceExcerpt);
  expect(refreshed?.answers.find(a=>a.kind==='instruction')?.answer).toContain('仅定位，不是经历事实');
  expect(refreshed!.result!.f6Deliverables!.files['resume-new.md'])
    .toBe(captured.result!.f6Deliverables!.files['resume-new.md']);
  expect((await runResumeConversation(request(),{id:'owner'},body,revise)).status).toBe(200);
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);expect(revise).toHaveBeenCalledTimes(1);
  expect(db.rows('interview_answers')).toEqual([{id:'old',user_id:'real',answer:'原作答'}]);
  expect(db.rows('watcha_wallets')).toEqual([{user_id:'real',balance:99}]);
  expect(db.rows('user_quotas')).toEqual([{user_id:'real',paid_resume_remaining:7}]);
});

test('a bad nonempty locator is retained/refunded as a technical failure, not blamed on user placement',async()=>{
  const bad={...parsed,supplements:[{...parsed.supplements[0],sourceExcerpt:'不存在的当前项目'}]};
  (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify(bad));
  const revise=jest.fn(),response=await runResumeConversation(request(),{id:'owner'},body,revise);
  expect(await response.json()).toMatchObject({conversationDecision:'discuss',conversationRecovery:'evidence_not_applied'});
  expect(revise).not.toHaveBeenCalled();
  const refreshed=await readResumeTask('owner','opp');
  expect(refreshed?.conversation?.at(-1)?.reply).toContain('本轮没有执行新修改');
  expect(refreshed?.conversation?.at(-1)?.reply).not.toContain('哪一段实习或项目');
  expect(refreshed?.answers).toEqual([]);
  expect(finalizeQuota).toHaveBeenCalledWith(expect.objectContaining({id:'qa-reservation'}),false);
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);
});

test('rejecting the suggestion during the model call invalidates the old target before any edit',async()=>{
  (observedResumeLLM as jest.Mock).mockImplementation(async()=>{
    const metadata=db.rows('coach_opportunities')[0].metadata as {resumeChanges:unknown[]};
    metadata.resumeChanges=fixture.source.changes.map(change=>({...change,status:'rejected'}));
    return fixture.rawDecision;
  });
  const revise=jest.fn(),response=await runResumeConversation(request(),{id:'owner'},body,revise);
  expect(response.status).toBe(409);expect(revise).not.toHaveBeenCalled();
  expect(db.rows('coach_resume_tasks')[0].answers).toEqual([]);
});

test('a stale target is checked again between saving the decision and acquiring an editor lease',async()=>{
  const opened=await beginResumeMessage('owner','opp',turn.id,turn.message);
  const plan=parseResumeConversationDecision(fixture.rawDecision,opened.source.resume,opened.task.conversation!,
    {...opened.source,task:opened.task});
  await completeResumeMessage('owner','opp',turn.id,opened.version,plan);
  const metadata=db.rows('coach_opportunities')[0].metadata as {resumeChanges:unknown[]};
  metadata.resumeChanges=fixture.source.changes.map(change=>({...change,status:'rejected'}));
  await expect(claimResumeTask('owner','opp',{action:'conversation',messageId:turn.id})).rejects.toThrow('位置已更新');
  expect(db.rows('coach_resume_tasks')[0].answers).toEqual([]);
  expect(db.rows('coach_resume_tasks')[0].lease_id).toBeNull();
});

test('the recorded current-draft target never crosses account boundaries',async()=>{
  const revise=jest.fn();
  await expect(runResumeConversation(request(),{id:'other'},body,revise)).rejects.toThrow('不可访问');
  expect(observedResumeLLM).not.toHaveBeenCalled();expect(reserveQuota).not.toHaveBeenCalled();
  expect(revise).not.toHaveBeenCalled();
});

test('a consumed message stays idempotent after the editor has produced a newer generation',async()=>{
  const revise=jest.fn(async(messageId:string)=>(await claimResumeTask('owner','opp',
    {action:'conversation',messageId})).task);
  await runResumeConversation(request(),{id:'owner'},body,revise);
  const row=db.rows('coach_resume_tasks')[0];
  row.state='ready';row.result={...captured.result,resumeGenerationId:'new-generation'};
  const answerCount=(row.answers as unknown[]).length;
  const second=await claimResumeTask('owner','opp',{action:'conversation',messageId:turn.id});
  expect(second.claimed).toBe(false);
  expect((db.rows('coach_resume_tasks')[0].answers as unknown[]).length).toBe(answerCount);
  expect(observedResumeLLM).toHaveBeenCalledTimes(1);expect(revise).toHaveBeenCalledTimes(1);
});
