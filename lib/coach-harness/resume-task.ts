import { createHash, randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { requireDb } from "./repository";
import { nextResumeQuestion, type ResumeAgentTask, type ResumeAgentAnswer } from "./resume-task-types";
import type { CareerClaim } from "./types";
import type { Opportunity, ResumeChange } from "@/lib/opportunities/types";
import type { ResumeRecovery } from "./resume-recovery";
import { mergeResumeAgentChanges } from "@/lib/opportunities/resume-agent-merge";

type Row = { id: string; user_id: string; opportunity_id: string; fingerprint: string; source_revision?:string; state: ResumeAgentTask["state"]; question: ResumeAgentTask["question"]; answers: ResumeAgentAnswer[]; result: ResumeAgentTask["result"] | null; error: string | null; version: number; lease_id: string | null; updated_at: string };
export class ResumeTaskError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const resumeTaskFingerprint = (resume: string, jd: string, revision?: string) => createHash("sha256").update(JSON.stringify([resume.trim(), jd.trim(), revision || ""])).digest("hex");
export function publicResumeTask(row: Row): ResumeAgentTask {
  return { id: row.id, state: row.state, question: row.question, answers: row.answers, updatedAt: row.updated_at,
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
  return { resume, jd, revision: String(data.metadata?.resumeRevision || ""), changes:(data.metadata?.resumeChanges||[]) as ResumeChange[], general: data.metadata?.workspaceType === "preparation", fingerprint: resumeTaskFingerprint(resume, jd, data.metadata?.resumeRevision) };
}
async function readRow(userId: string, opportunityId: string): Promise<Row | null> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_resume_tasks").select("*").eq("user_id", userId).eq("opportunity_id", opportunityId).maybeSingle();
  if (error) throw new ResumeTaskError("改稿进度暂时无法读取，请重试", 503);
  return data;
}
export async function readResumeTask(userId: string, opportunityId: string) {
  const source = await ownedResumeTaskSource(userId, opportunityId), row = await readRow(userId, opportunityId);
  return row && row.fingerprint === source.fingerprint ? publicResumeTask(row) : null;
}

/** 回答先用版本 CAS 保存，然后独占生成。两个并发请求不能启动两次模型。 */
export async function claimResumeTask(userId: string, opportunityId: string, input: { action?: string; questionId?: string; answer?: string }) {
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
    if (input.action === "answer") throw new ResumeTaskError("简历已更换，这条补问不再适用；输入仍保留");
    const retained=source.revision&&row.source_revision===source.revision?row.answers.filter(answer=>source.resume.includes(answer.sourceExcerpt)):[];
    await write({ fingerprint: source.fingerprint, source_revision:source.revision, state: "idle", question: null, answers: retained, result: null, error: null, lease_id: null });
  }
  if (row!.state === "running") {
    // 超过整条请求时限才允许用户显式重试；旧持有者的 lease 已失效，不能迟到覆盖。
    if (input.action !== "retry" || Date.now() - Date.parse(row!.updated_at) < 210_000) return { task: publicResumeTask(row!), source, claimed: false };
    await write({ state: "failed", lease_id: null, error: "上一轮未完成，已保留补充" });
  }
  if (input.action === "answer" || input.action === "skip") {
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
  } else if (row!.state === "needs_detail" || (row!.state === "ready" && input.action !== "restart")) {
    return { task: publicResumeTask(row!), source, claimed: false };
  }
  const lease = randomUUID();
  await write({ state: "running", lease_id: lease, question: null, error: null });
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
  const answers = row.answers.filter(answer => !answer.skipped && answer.claimId && answer.answer.trim());
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

export async function finishResumeTask(userId: string, taskId: string, lease: string, source: { resume: string; jd: string; revision:string }, body: {ok?:boolean;recovery?:ResumeRecovery;error?:string;changes?:ResumeChange[];applicationQuality?:Opportunity["applicationQuality"]}) {
  const db = requireDb(await getDbClient()), row = await resumeTaskInput(userId, taskId, lease);
  const question = !body.ok && body.recovery && !body.recovery.detailSaved
    ? nextResumeQuestion(source.resume, body.recovery, row.answers) : null;
  const state = body.ok ? "ready" : question ? "needs_detail" : "failed";
  const current=body.ok?await ownedResumeTaskSource(userId,row.opportunity_id):null;
  const result = body.ok ? { changes: mergeResumeAgentChanges(source.resume,current?.changes||[],body.changes||[]), applicationQuality: body.applicationQuality, resumeGenerationId: `${taskId}:${row.version}`, previousChanges:current?.changes||[], resumeCheckStale:Boolean(current?.changes.some(change=>change.status!=='pending')) } : null;
  const { data, error } = await db.rpc("finish_coach_resume_task", { p_user_id: userId, p_task_id: taskId, p_lease: lease,
    p_state: state, p_question: question, p_result: result, p_error: body.ok || question ? null : String(body.error || "改稿暂未完成，补充已保存，可以重试"),
    p_source: source.resume, p_jd: source.jd, p_revision: source.revision });
  if (error || !data) throw new ResumeTaskError("改稿保存尚未确认，请刷新进度后继续，不必重填补充", 503);
  return publicResumeTask(data);
}
