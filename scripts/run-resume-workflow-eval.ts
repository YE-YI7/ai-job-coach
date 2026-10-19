/** Real core execution, never the billable user endpoint. Default is plan-only.
 * npx tsx --env-file=<private env> scripts/run-resume-workflow-eval.ts --execute
 * Requires EVAL_SITE_MODEL_COST_ACK=1; never accepts user/opportunity/task IDs.
 */
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { getDbClient } from "../lib/db";
import { runResumeDraft } from "../lib/coach-harness/resume-execution";
import { withEvalObserver, type EvalSpan, redactEval } from "../lib/coach-harness/eval-observer";
import { applyResumeChanges } from "../lib/coach-harness/application-quality";
import { RESUME_WORKFLOW_VERSION, type ReviewStrategy, type FormatPolicy } from "../lib/coach-harness/resume-document-review";
import { resumeWorkflowFixtures as fixtures, RESUME_FIXTURE_VERSION } from "../evals/resume-workflow-fixtures";
import { RESUME_TRACE_EVENT, resumeRequestHash } from "../lib/coach-harness/resume-trace";
import { nextResumeQuestion, type ResumeAgentAnswer } from "../lib/coach-harness/resume-task-types";
async function main(){
const strategyFilter=process.env.EVAL_STRATEGY_FILTER?.split(",").filter(Boolean);
const strategies:ReviewStrategy[]=(["independent","self_review","format_only"] as const).filter(s=>!strategyFilter||strategyFilter.includes(s));
if(!strategies.length)throw Error("Strategy selection is empty");
const developmentOnly=process.argv.includes("--development-only");
const holdoutOnly=process.argv.includes("--holdout-only");
const fixtureFilter=process.env.EVAL_FIXTURE_FILTER?.split(",").filter(Boolean);
if(developmentOnly&&holdoutOnly)throw Error("Choose one split");
const batchId=process.env.EVAL_BATCH_ID || randomUUID();
if(!/^[0-9a-f-]{36}$/i.test(batchId))throw Error("Invalid batch ID");
const idFor=(key:string)=>{const hex=createHash("sha256").update(batchId+key).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]="8";const s=hex.join("");return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
type Job={fixture:typeof fixtures[number];strategy:ReviewStrategy;policy:FormatPolicy;repeat:number;phase:"initial"|"after_answer"};
const jobs:Job[]=fixtures.filter(f=>(!developmentOnly||f.split==="development")&&(!holdoutOnly||f.split==="holdout")&&(!fixtureFilter||fixtureFilter.includes(f.id))).flatMap((fixture,i)=>[...strategies.slice(i%3),...strategies.slice(0,i%3)].map(strategy=>({fixture,strategy,policy:"preserve" as const,repeat:1,phase:"initial" as const})));
if(!jobs.length)throw Error("Fixture selection is empty");
if(!developmentOnly&&!holdoutOnly&&!fixtureFilter)jobs.push(...strategies.map(strategy=>({fixture:fixtures[3],strategy,policy:"preserve" as const,repeat:2,phase:"initial" as const})));
if(!holdoutOnly&&!fixtureFilter)jobs.push(...(["repair","standard"] as const).map(policy=>({fixture:fixtures[0],strategy:"independent" as const,policy,repeat:1,phase:"initial" as const})));
const executionSourceHash=createHash("sha256").update((await Promise.all(["lib/coach-harness/resume-execution.ts","lib/coach-harness/resume-document-review.ts","lib/coach-harness/resume-edit-value.ts"].map(path=>readFile(path,"utf8")))).join("\n")).digest("hex");
const config={workflow:RESUME_WORKFLOW_VERSION,executionSourceHash,fixtures:RESUME_FIXTURE_VERSION,developmentOnly,holdoutOnly,fixtureHash:createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"),
  plan:jobs.map(j=>({fixtureId:j.fixture.id,split:j.fixture.split,strategy:j.strategy,formatPolicy:j.policy,repeat:j.repeat,phase:j.phase})),
  maxFollowUpRuns:3,maxWorkflowCalls:104,concurrency:1,transportRetries:0,automaticRepairs:1,synthetic:true,pointsBypassed:true,
  requestedProvider:"deepseek",requestedModel:"deepseek-v4-flash",billingSource:"site_api_key_no_user_gateway",
  metrics:["grounding_veto","format_regression","usefulness","overediting","gap_questioning","repair_convergence","failure_type","latency","tokens","estimated_cost","repeat_consistency"],
  limitations:["小样本描述，不推断总体排名或p95。","未做人工盲评前无冠军。","规则格式通过不等于内容质量通过。","API估价不是实际扣费。","原PDF排版几何不在纯文本格式约定中。"]};
if(!process.argv.includes("--execute")){console.log(JSON.stringify({batchId,config},null,2));process.exit(0);}
if(process.env.EVAL_SITE_MODEL_COST_ACK!=="1"||process.env.LLM_STUB==="1")throw Error("Explicit site-model billing acknowledgement required; stubs forbidden");
if(process.env.HOSTED_LLM_PROVIDER!=="deepseek")throw Error("This frozen comparison requires explicit HOSTED_LLM_PROVIDER=deepseek; do not silently use a different hosted model");
const actor=(process.env.EVAL_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).find(Boolean);
if(!actor)throw Error("Admin actor required for private run ownership");
const db=await getDbClient();if(!db)throw Error("Private database unavailable; no model called");
const initial=await db.from("coach_eval_batches").insert({id:batchId,actor_user_id:actor,label:"三种整稿检查策略 · 虚构样本对照",config});
if(initial.error&&initial.error.code!=="23505")throw Error("Batch storage failed; no model called");
const previous=await db.from("coach_eval_batches").select("config").eq("id",batchId).single();
if(previous.error||JSON.stringify(previous.data.config)!==JSON.stringify(config)){
  // JSONB key order is unspecified, so compare semantic fixture/workflow identities.
  if(previous.error||previous.data?.config?.fixtureHash!==config.fixtureHash||previous.data?.config?.workflow!==config.workflow||previous.data?.config?.executionSourceHash!==config.executionSourceHash)throw Error("Batch contract mismatch");
}
const directory=`docs/architecture/evals/workflow-${batchId}`;
await mkdir(directory,{recursive:true});
const records:Record<string,any>[]=[];
let totalCalls=0,fatalProvider=false;
async function execute(job:Job,answers:ResumeAgentAnswer[]=[]) {
  const key=`${job.fixture.id}:${job.strategy}:${job.policy}:${job.repeat}:${job.phase}`,id=idFor(key),start=Date.now(),spans:EvalSpan[]=[];
  const found=await db!.from("coach_eval_runs").select("run,status").eq("id",id).maybeSingle();if(found.error)throw Error("Run lookup failed");
  if(found.data){records.push(found.data.run);if(found.data.status==="running")throw Error("Prior run incomplete; inspect by ID instead of silently repeating model calls");return found.data.run;}
  const run:Record<string,any>={id,label:`${job.fixture.name} · ${job.strategy} · ${job.phase}`,source:"isolated_experiment",provenance:"real_model_synthetic_input",status:"running",startedAt:new Date(start).toISOString(),
    experiment:{batchId,fixtureId:job.fixture.id,split:job.fixture.split,strategy:job.strategy,formatPolicy:job.policy,repeat:job.repeat,phase:job.phase},
    input:{resume:job.fixture.resume,jobDescription:job.fixture.jd,answers},spans,evaluation:null,evaluationStatus:"not_requested",result:{status:"running",output:null}};
  const insert=await db!.from("coach_eval_runs").insert({id,user_id:actor,label:run.label,status:run.status,run});if(insert.error)throw Error(`Run insert failed [${insert.error.code||"transport"}]; no duplicate model execution`);
  const save=async()=>{if(totalCalls+spans.filter(s=>s.kind==="agent").length>config.maxWorkflowCalls)throw Error("Site model call budget exhausted");const saved=await db!.from("coach_eval_runs").update({run:redactEval(run),status:run.status,legacy_trace_id:run.resumeTraceId||null,updated_at:new Date().toISOString()}).eq("id",id);if(saved.error)throw Error("Run persistence failed");};
  try{
    const response=await withEvalObserver({spans,save},()=>runResumeDraft(new Request("https://eval.invalid/internal",{method:"POST",body:JSON.stringify({resumeText:job.fixture.resume,jobDescription:job.fixture.jd,mode:job.fixture.jd?"target_resume":"general_resume",requestId:id})}),{id:actor} as any,{isolated:true,strategy:job.strategy,formatPolicy:job.policy,isolatedAnswers:answers}));
    const output=await response.json();
    run.status=response.ok?(output.unchanged?"unchanged":"completed"):output.reasonCode==="resume_detail_needed"?"needs_detail":"failed";
    run.result={status:run.status,output:output.ok?applyResumeChanges(job.fixture.resume,output.changes||[]).text:output,rawResponse:output,httpStatus:response.status};
    const trace=await db!.from("product_events").select("properties").eq("event_name",RESUME_TRACE_EVENT).eq("user_id",actor).eq("properties->>requestHash",resumeRequestHash(id)).maybeSingle();
    if(trace.error)run.traceReadError=true;else{run.resumeTraceId=trace.data?.properties?.traceId||null;run.ruleQuality=trace.data?.properties?.quality||null;run.knowledge=trace.data?.properties?.retrieval||null;}
    fatalProvider=spans.some(s=>s.status==="failed"&&/balance|insufficient_quota|API_KEY not found|401|Authentication/i.test(JSON.stringify(s.output)));
  }catch(error){run.status="failed";run.result={status:"failed",error:error instanceof Error?error.name:"UnknownError"};}
  const calls=spans.filter(s=>s.kind==="agent"),sum=(key:"inputTokens"|"outputTokens"|"cacheHitTokens"|"estimatedCostUsd")=>calls.length&&calls.every(s=>s.usage?.[key]!==null&&s.usage?.[key]!==undefined)?calls.reduce((n,s)=>n+Number(s.usage![key]),0):null;
  totalCalls+=calls.length;
  run.metrics={wallMs:Date.now()-start,calls:calls.length,inputTokens:sum("inputTokens"),outputTokens:sum("outputTokens"),cacheHitTokens:sum("cacheHitTokens"),estimatedCostUsd:sum("estimatedCostUsd"),actualCost:null,costStatus:"estimate_only_no_invoice",workflowCalls:calls.length,offlineEvaluationCalls:0,
    failureCount:calls.filter(s=>s.status==="failed").length,repairs:spans.filter(s=>s.code==="returned_to_original_editor").length,formatVerified:run.result?.rawResponse?.documentReview?.status==="passed",pdfVerified:false,persistenceVerified:false};
  await save();await writeFile(`${directory}/${id}.json`,JSON.stringify(redactEval(run),null,2),{mode:0o600});records.push(run);
  console.log(JSON.stringify({id,fixture:job.fixture.id,strategy:job.strategy,phase:job.phase,status:run.status,...run.metrics}));
  return run;
}
for(const job of jobs){if(fatalProvider||totalCalls>=config.maxWorkflowCalls)break;await execute(job);}
for(const strategy of strategies){
  if(fatalProvider||totalCalls>=config.maxWorkflowCalls)break;
  const first=records.find(r=>r.experiment.fixtureId==="thin-student"&&r.experiment.strategy===strategy&&r.experiment.phase==="initial");
  const raw=first?.result?.rawResponse,question=nextResumeQuestion(fixtures[2].resume,raw?.followUp||raw?.recovery,[]);
  if(!question)continue;
  await execute({fixture:fixtures[2],strategy,policy:"preserve",repeat:1,phase:"after_answer"},[{...question,answer:fixtures[2].answers[question.field],claimId:randomUUID(),savedAt:new Date().toISOString()}]);
}
const summary={plannedInitial:jobs.length,executed:records.length,workflowCalls:totalCalls,counts:records.reduce((acc,r)=>(acc[r.status]=(acc[r.status]||0)+1,acc),{} as Record<string,number>),fatalProvider,
  blindReview:"pending_Grok",pdf:"not_verified",persistence:"not_verified",decision:"not_release_ready",limitations:config.limitations};
const update=await db.from("coach_eval_batches").update({status:fatalProvider?"failed":records.length<jobs.length?"partial":"completed",summary,updated_at:new Date().toISOString()}).eq("id",batchId);if(update.error)throw Error("Batch summary save failed");
await writeFile(`${directory}/summary.json`,JSON.stringify({batchId,config,summary},null,2));console.log(JSON.stringify({batchId,summary}));
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof Error?error.message:"Experiment failed"}));process.exitCode=1;});
