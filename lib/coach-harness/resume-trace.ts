import { createHash, randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { captureEvalStage, type EvalStageIO } from "./eval-scope";
import {resumeProcessingSummary} from './resume-processing';
import type {ResumeReviewDiagnostic} from './resume-review-diagnostic';

export const RESUME_TRACE_EVENT = "resume_agent_trace";
export type ResumeTraceOutcome = "running" | "completed" | "unchanged" | "needs_detail" | "blocked" | "failed" | "quota_denied";
export interface ResumeTrace {
  version: 1; traceId: string; requestHash: string; mode: "general_resume" | "target_resume";
  outcome: ResumeTraceOutcome; elapsedMs: number;
  steps: Array<{ stage: "context" | "retrieval" | "draft" | "grounding" | "review" | "save" | "failure"; elapsedMs: number; code: string; count?: number }>;
  retrieval: { status: "not_run" | "matched" | "no_close_example"; candidates: number; includedIds: string[];
    methodCandidateIds?: string[]; includedMethodIds?: string[]; excludedByBudgetIds?: string[];
    matches: Array<{ id: string; similarity: number; dimensions: string[]; signals: string[]; stageMatched: boolean }>;
    documentTitles?: Array<{ id: string; title: string }> };
  quality: null | { subject: "draft_quality_not_candidate"; score: number; grounding: boolean; independentReview: boolean; shortBullets: boolean; ats: boolean; proposed: number; retained: number };
  editingValue?: { reviewed:number; useful:number; rejected:number; kinds:string[]; personalDisclaimersOmitted:number; disposition:'revised'|'unchanged' };
  /** Fixed diagnostic categories only; never persist rejected text or prompts. */
  groundingRejections?: Array<{ attempt:number; index:number; codes:string[] }>;
  reviewDiagnostics?: ResumeReviewDiagnostic[];
}
export function resumeRequestHash(requestId: string) { return createHash("sha256").update(requestId).digest("hex"); }

/** Private operational metadata only: no résumé, JD, answer, contact, prompt or model reasoning. */
export async function startResumeTrace(userId: string, requestId: string, general: boolean) {
  const db = await getDbClient();
  if (!db) throw Error("RESUME_TRACE_UNAVAILABLE");
  const started = Date.now(), traceId = randomUUID();
  const trace: ResumeTrace = { version: 1, traceId, requestHash: resumeRequestHash(requestId), mode: general ? "general_resume" : "target_resume", outcome: "running", elapsedMs: 0,
    steps: [], retrieval: { status: "not_run", candidates: 0, includedIds: [], matches: [] }, quality: null };
  const write = async () => {
    trace.elapsedMs = Date.now() - started;
    const { error } = await db.from("product_events").upsert({ user_id: userId, event_name: RESUME_TRACE_EVENT,
      client_event_id: `resume-trace:${traceId}`, properties: trace }, { onConflict: "user_id,client_event_id" });
    if (error) throw Error("RESUME_TRACE_SAVE_FAILED");
  };
  await write(); // Fail before quota/model calls if the initial audit cannot be saved.
  // At most one checkpoint per real stage, not a timer or invented progress.
  // Serial snapshots prevent a slow earlier write overwriting the final result.
  let checkpoints=Promise.resolve();
  const published=new Set<string>();
  return {
    data: trace,
    step(stage: ResumeTrace["steps"][number]["stage"], code: string, count?: number, io?: EvalStageIO) {
      const now = Date.now(), previous = trace.steps.at(-1)?.elapsedMs || 0;
      captureEvalStage(stage, code, io, started + previous, Math.max(0, now - started - previous));
      if (trace.steps.length < 32) trace.steps.push({ stage, code, elapsedMs: now - started, ...(count === undefined ? {} : { count }) });
      if(!published.has(stage)){
        published.add(stage);
        const snapshot=structuredClone({...trace,elapsedMs:now-started});
        checkpoints=checkpoints.then(async()=>{
          const {error}=await db.from('product_events').upsert({user_id:userId,event_name:RESUME_TRACE_EVENT,client_event_id:`resume-trace:${traceId}`,properties:snapshot},{onConflict:'user_id,client_event_id'});
          if(error)throw Error('RESUME_TRACE_CHECKPOINT_FAILED');
        }).catch(()=>{console.error('Resume processing checkpoint unavailable');});
      }
    },
    async finish(outcome: ResumeTraceOutcome) { await checkpoints;trace.outcome = outcome; await write(); },
  };
}

/** Called only after reading an owned task. Read metadata, never the private
 * Eval I/O. Missing historical traces stay missing; no reconstruction. */
export async function readResumeProcessing(userId:string,requestId:string,hasJd:boolean,saved:boolean){
  try{
    const db=await getDbClient();if(!db)return undefined;
    const hash=resumeRequestHash(requestId);
    const {data,error}=await db.from('product_events').select('properties').eq('user_id',userId)
      .eq('event_name',RESUME_TRACE_EVENT).eq('properties->>requestHash',hash).order('occurred_at',{ascending:false}).limit(1).maybeSingle();
    const trace=data?.properties as ResumeTrace|undefined;
    if(error||trace?.version!==1||trace.requestHash!==hash||!Array.isArray(trace.steps)||!trace.retrieval||!trace.traceId)return undefined;
    return resumeProcessingSummary(trace,hasJd,saved);
  }catch{return undefined;}
}
