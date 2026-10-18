import { createHash, randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { captureEvalStage, type EvalStageIO } from "./eval-scope";

export const RESUME_TRACE_EVENT = "resume_agent_trace";
export type ResumeTraceOutcome = "running" | "completed" | "unchanged" | "needs_detail" | "blocked" | "failed" | "quota_denied";
export interface ResumeTrace {
  version: 1; traceId: string; requestHash: string; mode: "general_resume" | "target_resume";
  outcome: ResumeTraceOutcome; elapsedMs: number;
  steps: Array<{ stage: "context" | "retrieval" | "draft" | "grounding" | "review" | "save" | "failure"; elapsedMs: number; code: string; count?: number }>;
  retrieval: { status: "not_run" | "matched" | "no_close_example"; candidates: number; includedIds: string[];
    methodCandidateIds?: string[]; includedMethodIds?: string[]; excludedByBudgetIds?: string[];
    matches: Array<{ id: string; similarity: number; dimensions: string[]; signals: string[]; stageMatched: boolean }> };
  quality: null | { subject: "draft_quality_not_candidate"; score: number; grounding: boolean; independentReview: boolean; shortBullets: boolean; ats: boolean; proposed: number; retained: number };
  editingValue?: { reviewed:number; useful:number; rejected:number; kinds:string[]; personalDisclaimersOmitted:number; disposition:'revised'|'unchanged' };
  /** Fixed diagnostic categories only; never persist rejected text or prompts. */
  groundingRejections?: Array<{ attempt:number; index:number; codes:string[] }>;
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
  return {
    data: trace,
    step(stage: ResumeTrace["steps"][number]["stage"], code: string, count?: number, io?: EvalStageIO) {
      const now = Date.now(), previous = trace.steps.at(-1)?.elapsedMs || 0;
      captureEvalStage(stage, code, io, started + previous, Math.max(0, now - started - previous));
      if (trace.steps.length < 16) trace.steps.push({ stage, code, elapsedMs: now - started, ...(count === undefined ? {} : { count }) });
    },
    async finish(outcome: ResumeTraceOutcome) { trace.outcome = outcome; await write(); },
  };
}
