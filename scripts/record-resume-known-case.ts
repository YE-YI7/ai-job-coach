/** Explicitly register the owner's already supplied case, not browser-local notes. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getDbClient } from "../lib/db";
import { evalRunChangeIds, feedbackHash, parseEvalFeedback } from "../lib/coach-harness/eval-feedback";
async function main(){
  const journal=JSON.parse(await readFile("docs/architecture/evals/resume-case-feedback.json","utf8"));
  const c=journal.cases.find((item:{caseId:string})=>item.caseId==="YZ-CASE-20261019-001");
  if(!c)throw Error("Known case missing");
  const hex=createHash("sha256").update(c.caseId).digest("hex");
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const body=parseEvalFeedback({id,runId:c.evalRunId,changeId:c.changeId,scope:"change",category:"format",verdict:"improve",note:c.userFeedback,expected:c.expected});
  if(!body)throw Error("Invalid case contract");
  const db=await getDbClient();if(!db)throw Error("Unavailable");
  const stored=await db.from("coach_eval_runs").select("user_id,legacy_trace_id,run").eq("id",body.runId).single();
  if(stored.error||!evalRunChangeIds(stored.data?.run || {}).has(body.changeId!))throw Error("Case is not linked to an actual delivered change");
  const actor=(process.env.EVAL_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).find(v=>v===stored.data.user_id);
  if(!actor)throw Error("Explicit owner/admin actor required");
  const content_hash=feedbackHash(body,actor);
  const insert=await db.from("coach_eval_feedback").insert({id,run_id:body.runId,actor_user_id:actor,subject_user_id:stored.data.user_id,resume_trace_id:stored.data.legacy_trace_id,change_id:body.changeId,scope:body.scope,category:body.category,verdict:body.verdict,note:body.note,expected:body.expected,content_hash});
  if(insert.error&&insert.error.code!=="23505")throw Error("Feedback persistence failed");
  const verified=await db.from("coach_eval_feedback").select("id,run_id,change_id,content_hash").eq("id",id).single();
  if(verified.error||verified.data?.content_hash!==content_hash)throw Error("Feedback readback mismatch");
  console.log(JSON.stringify({feedbackId:id,runId:body.runId,changeId:body.changeId,persisted:true,replayed:insert.error?.code==="23505"}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Failed");process.exitCode=1;});
