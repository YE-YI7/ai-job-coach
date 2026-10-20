/** Imports only the three explicitly delivered fictional blind-review packages.
 * Default: validate/print counts. --execute: CAS-update private batch summaries.
 * Never calls a model, edits a résumé, or touches points/user tables.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDbClient } from "../lib/db";
const batches = ["ef89ed0e-4c3f-45a9-85f0-751500124c45", "330840f5-c387-4c7a-be56-b803795c4566", "a1216d4e-2567-4fba-b2b3-73a5ec8375be"];
async function main() {
  const execute = process.argv.includes("--execute");
  const db = execute ? await getDbClient() : null;
  if (execute && !db) throw Error("Private database unavailable");
  for (const batchId of batches) {
    const dir = `docs/architecture/evals/workflow-${batchId}/`;
    const raw = await readFile(dir + "grok-blind/review.json", "utf8");
    const report = JSON.parse(raw);
    const key = JSON.parse(await readFile(dir + "blind-answer-key.private.json", "utf8"));
    const seen = new Set<string>();
    const reviews = report.reviews.map((review: Record<string, any>) => {
      const lookup = `${review.caseKey}:${review.tag}`, target = key[lookup];
      if (!target || seen.has(lookup) || typeof review.groundingVeto !== "boolean" ||
          typeof review.evidence !== "string" || !review.evidence || !Array.isArray(review.dimensions) ||
          !Array.isArray(review.unknown) || typeof review.orderSwapConsistent !== "boolean" ||
          review.dimensions.some((d: any) => typeof d.name !== "string" || typeof d.reason !== "string" ||
            !Number.isInteger(d.score) || d.score < 0 || d.score > 4 || d.maxScore !== 4)) throw Error("Invalid review: " + lookup);
      seen.add(lookup);
      return { ...review, runId: target.runId };
    });
    if (seen.size !== Object.keys(key).length) throw Error("Missing candidates in " + batchId);
    const externalReview = {
      source: "user_delivered_blind_review", reviewer: "Grok (user-delivered; runtime identity not measured)",
      sha256: createHash("sha256").update(raw).digest("hex"), recordedAt: new Date().toISOString(),
      count: reviews.length, groundingVetoCount: reviews.filter((r: any) => r.groundingVeto).length,
      orderDisagreementCount: reviews.filter((r: any) => r.orderSwapConsistent === false).length,
      offlineEvaluationCost: null, notes: report.notes, reviews,
    };
    if (db) {
      const batch = await db.from("coach_eval_batches").select("summary,updated_at").eq("id", batchId).single();
      if (batch.error || !batch.data) throw Error("Batch lookup failed");
      const runs = await db.from("coach_eval_runs").select("id,experiment:run->experiment").eq("run->experiment->>batchId", batchId);
      if (runs.error || reviews.some((r: any) => !runs.data?.some((row: any) => row.id === r.runId))) throw Error("Review/run ownership mismatch");
      if (batch.data.summary?.externalReview?.sha256 !== externalReview.sha256) {
        const saved = await db.from("coach_eval_batches").update({summary:{...batch.data.summary,blindReview:"reviewed_with_findings",externalReview},updated_at:new Date().toISOString()})
          .eq("id",batchId).eq("updated_at",batch.data.updated_at).select("id").maybeSingle();
        if (saved.error || !saved.data) throw Error("Batch changed or write failed; no overwrite");
      }
      const check = await db.from("coach_eval_batches").select("summary").eq("id",batchId).single();
      if (check.error || check.data?.summary?.externalReview?.sha256 !== externalReview.sha256) throw Error("Readback mismatch");
    }
    console.log(JSON.stringify({batchId,count:externalReview.count,veto:externalReview.groundingVetoCount,orderDisagreements:externalReview.orderDisagreementCount,persisted:!!db}));
  }
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Review import failed");process.exitCode=1;});
