import {getDbClient} from '@/lib/db';
import {FakeDb} from './run-ledger/testing/fake-db';
import {beginResumeMessage, claimResumeTask, completeResumeMessage, persistResumeAnswerClaims,
  readResumeTask, resumeTaskFingerprint, resumeTaskInput} from './resume-task';
import {parseResumeConversationDecision, resumeConversationMessages} from './resume-conversation-decision';
import {f6InitialMessages} from './resume-f6-writer';
import {currentF6MentorGuidance, latestF6MentorTurn} from './f6-mentor-guidance';

jest.mock('@/lib/db');
const source='负责客服问答的需求和规则验收，与算法和后端协作交付。';
const guidance='这段可能体现交付推进，但“带团队”未确认。可回忆分任务、定验收或协调上线这几种情形，你实际负责哪一种？';
const id='44444444-4444-4444-8444-444444444444';
let db:FakeDb;
beforeEach(()=>{
  db=new FakeDb({coach_opportunities:[{id:'job',user_id:'owner',jd_text:'',status:'active',
    metadata:{resumeText:source,resumeRevision:'rev',workspaceType:'preparation'}}],
  coach_resume_tasks:[{id:'task',user_id:'owner',opportunity_id:'job',fingerprint:resumeTaskFingerprint(source,'','rev'),
    state:'ready',question:null,answers:[],conversation:[],version:1,source_revision:'rev',updated_at:new Date().toISOString(),
    result:{changes:[],resumeGenerationId:'task:1',f6Deliverables:{files:{'changes.md':guidance,'resume-new.md':source},
      resumeRevision:1,renderedRevision:-1,mentorGuidance:{version:1,text:guidance,resumeRevision:1,current:true}}}}]});
  (getDbClient as jest.Mock).mockResolvedValue(db);
});

test.each([
  {name:'确认具体动作',message:'我制定了上线前的验收清单，组织客服确认，但没有人员管理权。',
    brief:'只补入验收清单和协调确认，不能写带团队。'},
  {name:'否认原先角度',message:'我没有带团队，也没有协调上线，我只负责规则验收。',
    brief:'撤回带团队或协调上线的假设，保留规则验收责任。'},
])('$name survives save/read/claim and reaches the same author as real user evidence',async({message,brief})=>{
  const opened=await beginResumeMessage('owner','job',id,message);
  const payload=JSON.parse(resumeConversationMessages(opened.source,opened.task).messages[1].content);
  expect(payload.mentorGuidance.text).toBe(guidance);
  const plan=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'我会按你的实际责任更新这一段。',
    editorBrief:brief,supplements:[{turnId:id,quote:message,sourceExcerpt:source,field:'scope'}]}),source,opened.task.conversation!);
  await completeResumeMessage('owner','job',id,opened.version,plan);
  expect((await readResumeTask('owner','job'))?.conversation?.[0]).toMatchObject({message,status:'completed'});
  const claimed=await claimResumeTask('owner','job',{action:'conversation',messageId:id});
  expect(claimed.claimed).toBe(true);
  const input=await resumeTaskInput('owner','task',claimed.lease!);
  const claims=await persistResumeAnswerClaims(input);
  expect(claims.map(c=>c.displayText)).toEqual([message]);
  expect(db.rows('coach_claims').some(c=>c.display_text===guidance)).toBe(false);
  const author=JSON.parse(f6InitialMessages({resume:source,jd:'',facts:claims.map(c=>({id:c.id,text:c.displayText})),
    answers:input.answers,decisions:[],request:brief,scope:'whole',format:{},mentorCoaching:true,
    previousMentorGuidance:currentF6MentorGuidance(input.result?.f6Deliverables)})[1].content);
  expect(author.previousMentorGuidance.text).toBe(guidance);
  expect(author.previousMentorGuidance.provenance).toContain('不是候选人事实');
  expect(author['facts.md'].map((c:{text:string})=>c.text)).toEqual([message]);
  expect((await claimResumeTask('owner','job',{action:'conversation',messageId:id})).claimed).toBe(false);
  await expect(readResumeTask('other','job')).rejects.toThrow('不可访问');
  expect(db.rows('interview_answers')).toEqual([]);
});

test('learning intent omitted from the editor brief still reaches the author verbatim, never as a claim',()=>{
  const message='记不清1pp容忍度的依据。请教我面试怎么解释，不要把后来验证写成做过。';
  const turn={id, message, reply:'我会按实际责任修改。',status:'completed' as const,savedAt:'now'};
  const latest=latestF6MentorTurn([turn]);
  const author=JSON.parse(f6InitialMessages({resume:source,jd:'',facts:[],answers:[],decisions:[],
    request:'只修正项目三的责任和离线状态',scope:'whole',format:{},mentorCoaching:true,latestMentorTurn:latest})[1].content);
  expect(author.latestMentorTurn.userMessage).toBe(message);
  expect(author.latestMentorTurn.mentorReply).toBe(turn.reply);
  expect(author['facts.md']).toEqual([]);
  expect(latestF6MentorTurn([{...turn,status:'pending'}])).toBeUndefined();
});

test('unknown retains the saved draft; teaching is not promoted to a claim or an automatic rewrite',async()=>{
  const opened=await beginResumeMessage('owner','job',id,'记不清了');
  const plan=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'先保留协作口径。可以找当时的验收单，回忆你定过哪项标准；现在不用补数字。',
    editorBrief:'误要求删除经历',supplements:[]}),source,opened.task.conversation!);
  expect(plan.action).toBe('discuss');
  await completeResumeMessage('owner','job',id,opened.version,plan);
  const saved=await readResumeTask('owner','job');
  expect(saved?.result?.f6Deliverables?.files['resume-new.md']).toBe(source);
  expect(saved?.answers).toEqual([]);
  expect(saved?.conversation?.[0].reply).toContain('验收单');
  expect(db.rows('coach_claims')).toEqual([]);
  await expect(claimResumeTask('owner','job',{action:'conversation',messageId:id})).rejects.toThrow('尚未决定');
});
