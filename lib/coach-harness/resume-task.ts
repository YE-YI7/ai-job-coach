import { createHash, randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { requireDb } from "./repository";
import { nextResumeQuestion, type ResumeAgentTask, type ResumeAgentAnswer, type ResumeConversationTurn } from "./resume-task-types";
import type { ResumeConversationDecision } from "./resume-conversation-decision";
import type { CareerClaim } from "./types";
import type { Opportunity, ResumeChange } from "@/lib/opportunities/types";
import type { ResumeRecovery } from "./resume-recovery";
import { mergeResumeAgentChanges } from "@/lib/opportunities/resume-agent-merge";
import { currentResumeAnswer } from './resume-supplement';
import { resumeMessageExpired } from './resume-conversation-recovery';
import { resolveResumeTrialScope, type ResumeTrialScope } from '@/lib/resume-experience-trial';
import {readResumeProcessing} from './resume-trace';
import {readResumeDelivery} from './resume-delivery-record';
import {skipsResumeFact} from './resume-single-question';

type SavedConversationTurn=ResumeConversationTurn&{plan?:ResumeConversationDecision};
type Row = { id: string; user_id: string; opportunity_id: string; fingerprint: string; source_revision?:string; state: ResumeAgentTask["state"]; question: ResumeAgentTask["question"]; answers: ResumeAgentAnswer[]; conversation?:SavedConversationTurn[]; result: ResumeAgentTask["result"] | null; error: string | null; version: number; lease_id: string | null; updated_at: string; edit_scope?: ResumeTrialScope | null };
export class ResumeTaskError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const resumeTaskFingerprint = (resume: string, jd: string, revision?: string) => createHash("sha256").update(JSON.stringify([resume.trim(), jd.trim(), revision || ""])).digest("hex");
export function publicResumeTask(row: Row): ResumeAgentTask {
  return { id: row.id, state: row.state, question: row.question, answers: row.answers, updatedAt: row.updated_at,
    ...(row.edit_scope ? {editScope:row.edit_scope} : {}),
    ...(row.conversation?.length?{conversation:row.conversation.map(({id,message,reply,status,decision,savedAt,failure})=>({id,message,reply,status,decision,savedAt,...(failure?{failure}:{})}))}:{}),
    ...(row.result ? { result: row.result } : {}), ...(row.error ? { error: row.error } : {}) };
}

export async function ownedResumeTaskSource(userId: string, opportunityId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_opportunities").select("id,jd_text,metadata").eq("user_id", userId).eq("id", opportunityId).eq("status", "active").maybeSingle();
  if (error) throw new ResumeTaskError("简历暂时无法读取，请稍后重试", 503);
  if (!data) throw new ResumeTaskError("当前简历不可访问", 404);
  const resume = String(data.metadata?.resumeText || "").trim();
  const jd = String(data.jd_text || "").trim();
  if (!resume) throw new ResumeTaskError("请先上传简历", 400);
  if (resume.length>30_000||jd.length>30_000) throw new ResumeTaskError("简历或岗位原文超过30000字，请先精简；原文已保留，尚未调用模型",400);
  return { resume, jd, revision: String(data.metadata?.resumeRevision || ""), changes:(data.metadata?.resumeChanges||[]) as ResumeChange[], applicationQuality:data.metadata?.applicationQuality as Opportunity['applicationQuality'], general: data.metadata?.workspaceType === "preparation", fingerprint: resumeTaskFingerprint(resume, jd, data.metadata?.resumeRevision) };
}
async function readRow(userId: string, opportunityId: string): Promise<Row | null> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_resume_tasks").select("*").eq("user_id", userId).eq("opportunity_id", opportunityId).maybeSingle();
  if (error) throw new ResumeTaskError("改稿进度暂时无法读取，请重试", 503);
  return data;
}
export async function readResumeTask(userId: string, opportunityId: string) {
  const source = await ownedResumeTaskSource(userId, opportunityId), row = await readRow(userId, opportunityId);
  if(row&&row.fingerprint===source.fingerprint&&row.state==='needs_detail'&&row.question&&!nextResumeQuestion(source.resume,row.question,row.answers))return publicResumeTask({...row,state:'failed',question:null,error:'这条补问需要重新整理，原材料已保留，可以继续'});
  if(!row||row.fingerprint!==source.fingerprint)return null;
  const task=publicResumeTask(row);
  const delivery=await readResumeDelivery(userId,row.id,source.revision,row.state==='ready'?row.result?.resumeGenerationId:row.state==='running'?`${row.id}:${row.version}`:undefined);
  if(delivery)task.delivery=delivery.outcome==='running'&&row.state!=='running'?{...delivery,outcome:'unconfirmed'}:delivery;
  const generation=delivery?.generationId||(row.state==='ready'?row.result?.resumeGenerationId:`${row.id}:${row.state==='running'?row.version:row.version-1}`);
  if(generation){
    const processing=await readResumeProcessing(userId,`resume-task:${generation}`,Boolean(source.jd),row.state==='ready');
    if(processing)task.processing=processing;
  }
  return task;
}

/** Discussion has its own receipt, not a generation lease or an experience answer. */
export async function beginResumeMessage(userId:string,opportunityId:string,id:string,message:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!message.trim()||message.length>2000)throw new ResumeTaskError('请输入1–2000字消息',400);
  const source=await ownedResumeTaskSource(userId,opportunityId),row=await readRow(userId,opportunityId);
  if(!row||row.fingerprint!==source.fingerprint)throw new ResumeTaskError('简历任务已变化，请刷新后继续讨论');
  const turns=row.conversation||[],prior=turns.find(t=>t.id===id);
  if(prior&&prior.message!==message.trim())throw new ResumeTaskError('消息编号已用于其他内容，请刷新核对');
  if(prior?.status==='completed')return {task:publicResumeTask(row),source,version:row.version,replayed:true,
    needsRevision:prior.decision==='revise'&&prior.plan?.action==='revise'&&row.state!=='running'&&!row.answers.some(a=>a.id===`conversation:${id}`)};
  if(row.state==='running')throw new ResumeTaskError('导师正在完成当前修改，消息尚未提交，输入已保留');
  if(turns.some(t=>t.status==='pending'&&!resumeMessageExpired(t)))throw new ResumeTaskError('导师正在回复上一条消息，输入已保留，请稍后继续');
  const next:SavedConversationTurn={id,message:message.trim(),reply:'',status:'pending',savedAt:new Date().toISOString()};
  // The retry is the active turn, with the same ID, never a duplicate entry.
  const conversation=[...turns.filter(t=>t.id!==id).map(t=>t.status==='pending'?{...t,status:'failed' as const}:t),next];
  const db=requireDb(await getDbClient());
  const {data,error}=await db.from('coach_resume_tasks').update({conversation,version:row.version+1,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('id',row.id).eq('version',row.version).select('*').maybeSingle();
  if(error)throw new ResumeTaskError('消息尚未保存，输入已保留，请重试',503);
  if(!data)throw new ResumeTaskError('另一处已更新对话，请刷新后继续');
  return {task:publicResumeTask(data),source,version:data.version as number,replayed:false};
}
export async function completeResumeMessage(userId:string,opportunityId:string,id:string,version:number,plan:ResumeConversationDecision){
  const source=await ownedResumeTaskSource(userId,opportunityId),row=await readRow(userId,opportunityId);
  if(!row||row.version!==version||row.fingerprint!==source.fingerprint||row.state==='running')throw new ResumeTaskError('简历或对话已更新，本轮未执行修改，请刷新核对');
  if(!row.conversation?.some(t=>t.id===id&&t.status==='pending'))throw new ResumeTaskError('消息进度已变化，请刷新核对');
  const turn=row.conversation.find(t=>t.id===id)!;
  const skipped=row.question&&skipsResumeFact(turn.message)&&!row.answers.some(answer=>answer.id===row.question!.id);
  const safePlan=skipped?{...plan,supplement:null}:plan;
  const conversation=row.conversation.map(t=>t.id===id?{...t,status:'completed' as const,reply:safePlan.reply,decision:safePlan.action,plan:safePlan}:t);
  const db=requireDb(await getDbClient());
  const {data,error}=await db.from('coach_resume_tasks').update({conversation,...(skipped?{question:null,answers:[...row.answers,{...row.question!,answer:'',skipped:true,savedAt:new Date().toISOString()}]}:{}),version:version+1,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('id',row.id).eq('version',version).select('*').maybeSingle();
  if(error||!data)throw new ResumeTaskError('导师回复尚未保存，输入已保留，未执行修改',error?503:409);
  return publicResumeTask(data);
}
export async function failResumeMessage(userId:string,opportunityId:string,id:string,version:number,failure?:ResumeConversationTurn['failure']){
  const row=await readRow(userId,opportunityId);
  if(!row||row.version!==version)return;
  const db=requireDb(await getDbClient());
  const {error}=await db.from('coach_resume_tasks').update({conversation:(row.conversation||[]).map(t=>t.id===id&&t.status==='pending'?{...t,status:'failed',...(failure?{failure}:{})}:t),version:version+1,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('id',row.id).eq('version',version);
  if(error)throw new ResumeTaskError('消息状态尚未确认，请稍后按原消息重试',503);
}

/** 回答先用版本 CAS 保存，然后独占生成。两个并发请求不能启动两次模型。 */
export async function claimResumeTask(userId: string, opportunityId: string, input: { action?: string; questionId?: string; answer?: string; messageId?:string; trialBlockId?: string; trialExcerpt?:string }) {
  const db = requireDb(await getDbClient()), source = await ownedResumeTaskSource(userId, opportunityId);
  let row = await readRow(userId, opportunityId);
  if (!row) {
    const inserted = await db.from("coach_resume_tasks").insert({ user_id: userId, opportunity_id: opportunityId, fingerprint: source.fingerprint, source_revision:source.revision }).select("*").single();
    if (inserted.error && inserted.error.code !== "23505") throw new ResumeTaskError("未能建立改稿任务，尚未调用模型", 503);
    row = inserted.data || await readRow(userId, opportunityId);
  }
  if (!row) throw new ResumeTaskError("改稿任务暂时不可用", 503);
  const write = async (patch: Record<string, unknown>) => {
    const updated = await db.from("coach_resume_tasks").update({ ...patch, version: row!.version + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("id", row!.id).eq("version", row!.version).select("*").maybeSingle();
    if (updated.error) throw new ResumeTaskError("进度暂未确认，输入仍保留，请重试", 503);
    if (!updated.data) throw new ResumeTaskError("另一处已更新改稿进度，请刷新后继续");
    row = updated.data;
  };
  if (row.fingerprint !== source.fingerprint) {
    if (input.action === "answer" || input.action === "revise" || input.action==='conversation') throw new ResumeTaskError("简历已更换，这条补充不再适用；输入仍保留");
    const retained=source.revision&&row.source_revision===source.revision?row.answers.filter(answer=>source.resume.includes(answer.sourceExcerpt)):[];
    await write({ fingerprint: source.fingerprint, source_revision:source.revision, state: "idle", question: null, answers: retained, conversation:[],result: null, error: null, lease_id: null, edit_scope:null });
  }
  if(row!.state==='needs_detail'&&!nextResumeQuestion(source.resume,row!.question,row!.answers))await write({state:'idle',question:null,error:null});
  if (row!.state === "running") {
    // 超过整条请求时限才允许用户显式重试；旧持有者的 lease 已失效，不能迟到覆盖。
    if (input.action !== "retry" || Date.now() - Date.parse(row!.updated_at) < 330_000) return { task: publicResumeTask(row!), source, claimed: false };
    await write({ state: "failed", lease_id: null, error: "上一轮未完成，已保留补充" });
  }
  if (input.trialBlockId !== undefined) {
    if (!['start','restart'].includes(input.action || '')) throw new ResumeTaskError('请从体验入口选择一段经历',400);
    const scope = resolveResumeTrialScope(source.resume,String(input.trialBlockId));
    if (!scope || input.trialExcerpt !== scope.excerpt) throw new ResumeTaskError('经历已变化，请重新选择一段工作、实习或项目经历；不能免费修改整份简历',400);
    await write({edit_scope:scope,state:'idle',question:null,error:null});
  } else if (input.action === 'restart') {
    await write({edit_scope:null}); // Explicit full paid restart, never inherited from a free trial.
  }
  let conversationAnswers: ResumeAgentAnswer[] | undefined;
  if(input.action==='conversation'){
    const turn=row!.conversation?.find(t=>t.id===input.messageId&&t.status==='completed'&&t.decision==='revise');
    if(!turn?.plan||turn.plan.action!=='revise')throw new ResumeTaskError('导师尚未决定执行这次修改');
    const instructionId=`conversation:${turn.id}`;
    if(row!.answers.some(a=>a.id===instructionId))return {task:publicResumeTask(row!),source,claimed:false};
    const additions:ResumeAgentAnswer[]=[{id:instructionId,kind:'instruction',field:'context',sourceExcerpt:'',question:'导师确认的本次修改目标',answer:turn.plan.editorBrief,savedAt:new Date().toISOString()}];
    const supplement=turn.plan.supplement;
    const factId=supplement?`conversation-fact:${supplement.turnId}:${createHash('sha256').update(JSON.stringify([supplement.sourceExcerpt,supplement.quote])).digest('hex').slice(0,16)}`:'';
    if(supplement&&!row!.answers.some(a=>a.id===factId)){
      additions.push({id:factId,field:supplement.field,sourceExcerpt:supplement.sourceExcerpt,question:'讨论中补充的本人经历',answer:supplement.quote,claimId:randomUUID(),savedAt:new Date().toISOString()});
    }
    // Save the instruction and acquire its generation lease in the same CAS.
    // A process crash must not leave a consumed instruction with no editor run.
    conversationAnswers=[...row!.answers,...additions];
  } else if (input.action === "revise") {
    const answer=String(input.answer||"").trim();
    if(!answer||answer.length>2000)throw new ResumeTaskError("请填写1–2000字修改要求",400);
    const id=`instruction:${createHash('sha256').update(answer).digest('hex')}`;
    if(!row!.answers.some(item=>item.id===id)) {
      if(row!.answers.filter(item=>item.kind==='instruction').length>=10)throw new ResumeTaskError('本轮修改要求已较多，请先重试或直接编辑简历',400);
      if(row!.answers.filter(item=>item.kind==='instruction').reduce((sum,item)=>sum+item.answer.length,0)+answer.length>4000)throw new ResumeTaskError('本轮修改要求已较多，请先重试或直接编辑简历',400);
      await write({state:'idle',question:null,error:null,answers:[...row!.answers,{id,kind:'instruction',field:'context',sourceExcerpt:'',question:'修改要求',answer,savedAt:new Date().toISOString()}]});
    } else if(row!.state!=='idle'&&row!.state!=='failed')return {task:publicResumeTask(row!),source,claimed:false};
  } else if (input.action === "answer" || input.action === "skip") {
    if (input.action === "skip" && row!.state === "ready" && row!.result && row!.question?.id === input.questionId) {
      await write({ question: null, error: null, answers: [...row!.answers, { ...row!.question!, answer: "", skipped: true, savedAt: new Date().toISOString() }] });
      return { task: publicResumeTask(row!), source, claimed: false };
    }
    const already = row!.answers.find(answer => answer.id === input.questionId);
    if (already) {
      if (input.action === "answer" && already.answer !== input.answer?.trim()) throw new ResumeTaskError("该问题已保存了另一份回答，请刷新核对");
      if(row!.state!=='idle'&&row!.state!=='failed')return { task: publicResumeTask(row!), source, claimed: false };
    } else {
      if (!row!.question || row!.question.id !== input.questionId) throw new ResumeTaskError("补问已变化，请刷新核对；输入仍保留");
      const answer = String(input.answer || "").trim();
      if (input.action === "answer" && (!answer || answer.length > 2000)) throw new ResumeTaskError("请填写1–2000字真实补充", 400);
      await write({ state: "idle", question: null, error: null, answers: [...row!.answers, { ...row!.question, answer, skipped: input.action === "skip", claimId: randomUUID(), savedAt: new Date().toISOString() }] });
    }
  } else if ((row!.state === "needs_detail" && input.action !== "start" && input.action !== "restart") || (row!.state === "ready" && input.action !== "restart")) {
    return { task: publicResumeTask(row!), source, claimed: false };
  }
  const lease = randomUUID();
  await write({ state: "running", lease_id: lease, question: null, error: null, ...(conversationAnswers?{answers:conversationAnswers}:{}) });
  return { task: publicResumeTask(row!), source, claimed: true, lease, version: row!.version };
}

/** 仅供同进程改稿核心读取，客户端读不到 lease。补充不进入公开知识库。 */
export async function resumeTaskInput(userId: string, taskId: string, lease: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_resume_tasks").select("*").eq("user_id", userId).eq("id", taskId).eq("lease_id", lease).eq("state", "running").maybeSingle();
  if (error || !data) throw new ResumeTaskError("改稿任务已变化，请刷新后继续");
  return data as Row;
}

export async function persistResumeAnswerClaims(row: Row): Promise<CareerClaim[]> {
  const db = requireDb(await getDbClient());
  const answers = row.answers.filter(answer => answer.kind !== 'instruction' && !answer.skipped && answer.claimId && answer.answer.trim());
  if (!answers.length) return [];
  const rows = answers.map(answer => ({ id: answer.claimId!, user_id: row.user_id, opportunity_id: row.opportunity_id,
    entity_type: "experience", entity_key: `resume-task-${row.id}-${createHash("sha256").update(answer.id).digest("hex").slice(0,16)}`,
    claim_type: "resume_task_supplement", value: answer.answer, display_text: answer.answer, source_excerpt: answer.answer,
    source_kind: "user_statement", verification_level: "self_reported", status: "unverified", visibility: "recruiter_safe", confirmed_at: null }));
  const { error } = await db.from("coach_claims").upsert(rows, { onConflict: "id" });
  if (error) throw new ResumeTaskError("补充已保存，事实来源暂未就绪，请稍后继续", 503);
  return answers.map(answer => ({ id: answer.claimId!, entityType: "experience", entityKey: answer.id, claimType: "resume_task_supplement",
    value: answer.answer, displayText: answer.answer, sourceExcerpt: answer.answer,
    status: "unverified", visibility: "recruiter_safe", sourceKind: "user_statement", verificationLevel: "self_reported" }));
}

/** Persist only the owned selected upload as real UUID facts before model use.
 * Prompt-local resume-line-* labels are not database foreign keys. */
export async function persistResumeTrialClaims(userId:string,opportunityId:string,scope:ResumeTrialScope):Promise<CareerClaim[]> {
  const source=await ownedResumeTaskSource(userId,opportunityId);
  if(resolveResumeTrialScope(source.resume,scope.blockId)?.excerpt!==scope.excerpt)throw new ResumeTaskError('体验经历已变化，尚未调用模型',400);
  const db=requireDb(await getDbClient()),hash=createHash('sha256').update(scope.excerpt).digest('hex');
  let sourceRow=await db.from('coach_sources').select('id').eq('user_id',userId).eq('content_hash',hash).maybeSingle();
  if(sourceRow.error)throw sourceRow.error;
  if(!sourceRow.data){sourceRow=await db.from('coach_sources').insert({id:randomUUID(),user_id:userId,opportunity_id:opportunityId,source_type:'resume',title:'单段体验原文',content:scope.excerpt,content_hash:hash}).select('id').single();if(sourceRow.error)throw sourceRow.error;}
  const sourceId=String(sourceRow.data!.id),lines=[...new Set(scope.excerpt.split(/\n+/).map(line=>line.trim()).filter(Boolean))];
  const existing=await db.from('coach_claims').select('*').eq('user_id',userId).eq('source_id',sourceId).eq('claim_type','resume_trial_source');
  if(existing.error)throw existing.error;
  const rows=lines.map(line=>existing.data?.find((row:{display_text:string})=>row.display_text===line)||{id:randomUUID(),user_id:userId,opportunity_id:opportunityId,source_id:sourceId,entity_type:'experience',entity_key:`resume-trial-${createHash('sha256').update(line).digest('hex')}`,claim_type:'resume_trial_source',value:line,display_text:line,source_excerpt:line,status:'unverified',visibility:'recruiter_safe',source_kind:'user_upload',verification_level:'self_reported',confirmed_at:null});
  const missing=rows.filter(row=>!existing.data?.some((old:{id:string})=>old.id===row.id));
  if(missing.length){const saved=await db.from('coach_claims').insert(missing);if(saved.error)throw saved.error;}
  return rows.map(row=>({id:String(row.id),entityType:'experience',entityKey:String(row.entity_key),claimType:'resume_trial_source',value:row.value,displayText:String(row.display_text),sourceExcerpt:String(row.source_excerpt),sourceId,status:row.status as CareerClaim['status'],visibility:'recruiter_safe',sourceKind:'user_upload',verificationLevel:'self_reported'}));
}

export async function finishResumeTask(userId: string, taskId: string, lease: string, source: { resume: string; jd: string; revision:string; changes?:ResumeChange[] }, body: {ok?:boolean;recovery?:ResumeRecovery;followUp?:unknown;error?:string;changes?:ResumeChange[];applicationQuality?:Opportunity["applicationQuality"];prepared?:boolean;summary?:string;unchanged?:boolean}) {
  const db = requireDb(await getDbClient()), row = await resumeTaskInput(userId, taskId, lease);
  const question = body.ok ? nextResumeQuestion(source.resume, body.followUp, row.answers)
    : body.recovery && !body.recovery.detailSaved ? nextResumeQuestion(source.resume, body.recovery, row.answers) : null;
  const state = body.ok ? "ready" : question ? "needs_detail" : "failed";
  const current=body.ok?await ownedResumeTaskSource(userId,row.opportunity_id):null;
  const previous=source.changes??current?.changes??[];
  const answer=currentResumeAnswer(row.answers);
  const result = body.ok ? { changes: body.prepared?body.changes||[]:mergeResumeAgentChanges(source.resume,previous,body.changes||[],answer?[answer.sourceExcerpt]:[]), applicationQuality: body.applicationQuality, resumeGenerationId: `${taskId}:${row.version}`, previousChanges:previous, resumeCheckStale:Boolean(previous.some(change=>change.status!=='pending')), ...(body.summary?{summary:body.summary}:{}), ...(body.unchanged?{unchanged:true}:{}) } : null;
  const { data, error } = await db.rpc("finish_coach_resume_task", { p_user_id: userId, p_task_id: taskId, p_lease: lease,
    p_state: state, p_question: question, p_result: result, p_error: body.ok || question ? null : String(body.error || "改稿暂未完成，补充已保存，可以重试"),
    p_source: source.resume, p_jd: source.jd, p_revision: source.revision });
  if (error || !data) throw new ResumeTaskError("改稿保存尚未确认，请刷新进度后继续，不必重填补充", 503);
  return publicResumeTask(data);
}
