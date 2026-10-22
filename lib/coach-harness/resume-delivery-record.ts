import "server-only";
import { getDbClient } from "@/lib/db";
import { analyticsCohort } from "@/lib/analytics-cohort";
import { buildProductEventWrite } from "@/lib/product-events";
import { RESUME_DELIVERY_SCHEMA_VERSION, RESUME_DELIVERY_OUTCOMES, RESUME_PERSISTENCE, normalizeResumeReason, resumeDeliveryEventId, type ResumeDeliveryReceipt } from "./resume-delivery";
import { RESUME_WORKFLOW_VERSION } from "./resume-document-review";
import {createHash} from 'node:crypto';

export type DeliveryCoordinates = { taskId?: string; sourceRevision?: string; opportunityId?: string; documentRevision?: string; changeIds?: string[]; startedAt?: string; elapsedMs?: number; mode?: string };

/** Observation must not fail the edit, rerun the model, or change a quota. */
export async function recordResumeServerEvent(userId: string, event: "resume_task_started" | "resume_task_outcome" | "resume_document_persisted", generationId: string, receipt: ResumeDeliveryReceipt, coordinates: DeliveryCoordinates = {}) {
  if (process.env.NODE_ENV === "test" || !userId || !generationId) return "skipped" as const;
  try {
    const db = await getDbClient();
    if (!db) return "unconfirmed" as const;
    const properties = {
      schema_version: RESUME_DELIVERY_SCHEMA_VERSION,
      generation_id: generationId,
      trace_id: receipt.traceId,
      eval_run_id: receipt.evalRunId,
      outcome: event === "resume_task_started" ? "running" : receipt.outcome,
      persistence: receipt.persistence,
      stage: receipt.stage,
      reason_code: receipt.reasonCode,
      delivered_count: receipt.deliveredCount,
      retryable: receipt.retryable,
      task_id: coordinates.taskId || null,
      source_revision: coordinates.sourceRevision ?? null,
      opportunity_id: coordinates.opportunityId || null,
      document_revision: coordinates.documentRevision || null,
      change_ids: (coordinates.changeIds || []).join(','),
      started_at: coordinates.startedAt || null,
      ended_at: event === "resume_task_started" ? null : new Date().toISOString(),
      elapsed_ms: coordinates.elapsedMs ?? null,
      mode: coordinates.mode || null,
      workflow_version: RESUME_WORKFLOW_VERSION,
      code_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) || null,
      account_cohort: analyticsCohort(userId, process.env.ANALYTICS_INTERNAL_USER_IDS),
      environment: process.env.VERCEL_ENV || "development",
    };
    const write = buildProductEventWrite({
      userId,
      anonId: null,
      name: event,
      clientEventId: resumeDeliveryEventId(event, coordinates.documentRevision ? `${generationId}:${coordinates.documentRevision}` : generationId),
      occurredAt: new Date().toISOString(),
      properties,
    });
    const { error } = await db.from("product_events").upsert(write.row, { onConflict: write.onConflict, ignoreDuplicates: true });
    return error ? "unconfirmed" as const : "recorded" as const;
  } catch {
    return "unconfirmed" as const;
  }
}

export async function recordResumeDocument(userId:string,opportunityId:string,metadata:Record<string,unknown>,previous?:Record<string,unknown>){
  const generation=metadata.resumeGenerationId;
  if(typeof generation!=='string'||!generation.includes(':'))return;
  const document=(m:Record<string,unknown>)=>JSON.stringify([m.resumeText,m.resumeChanges,m.resumeBlockOrder,m.resumeTemplate]);
  if(previous&&document(previous)===document(metadata))return;
  const taskId=generation.slice(0,generation.lastIndexOf(':'));
  const receipt=await readResumeDelivery(userId,taskId,String(metadata.resumeRevision||''),generation);
  if(!receipt||receipt.persistence!=='confirmed')return;
  const revision=createHash('sha256').update(document(metadata)).digest('hex');
  await recordResumeServerEvent(userId,'resume_document_persisted',generation,receipt,{taskId,sourceRevision:String(metadata.resumeRevision||''),opportunityId,documentRevision:revision});
}

/** Read observations from this instrumentation only. A legacy task is not
 * retroactively a schema-2 success, even if it contains a saved result. */
export async function readResumeDelivery(userId: string, taskId: string, sourceRevision: string, generationId?: string): Promise<ResumeDeliveryReceipt | null> {
  try {
    const db = await getDbClient(); if (!db) return null;
    let query = db.from("product_events").select("properties").eq("user_id", userId)
      .in("event_name", ["resume_task_started", "resume_task_outcome"])
      .eq("properties->>task_id", taskId).eq("properties->>source_revision", sourceRevision);
    if (generationId) query = query.eq("properties->>generation_id", generationId);
    const { data, error } = await query.order("occurred_at", { ascending: false }).limit(1).maybeSingle();
    const p = data?.properties;
    if (error || Number(p?.schema_version) !== 2 || !RESUME_DELIVERY_OUTCOMES.includes(p.outcome) || !RESUME_PERSISTENCE.includes(p.persistence)) return null;
    return { schemaVersion: 2, generationId: p.generation_id || null, traceId: p.trace_id || null, evalRunId: p.eval_run_id || null,
      outcome: p.outcome, deliveredCount: typeof p.delivered_count === "number" ? p.delivered_count : null,
      persistence: p.persistence, stage: p.stage || null, reasonCode: normalizeResumeReason(p.reason_code), retryable: typeof p.retryable === "boolean" ? p.retryable : null, observation: "confirmed" };
  } catch { return null; }
}
