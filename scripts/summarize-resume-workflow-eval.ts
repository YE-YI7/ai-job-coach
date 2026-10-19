/** Recompute descriptive metrics from captured real I/O. Never calls a model. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDbClient } from "../lib/db";
import { checkResumeFormat } from "../lib/coach-harness/resume-document-review";
import { nextResumeQuestion } from "../lib/coach-harness/resume-task-types";
import { coversCurrentResumeAnswer } from "../lib/coach-harness/resume-supplement";
async function main(){
  const id=process.env.EVAL_BATCH_ID;if(!id||!/^[a-f0-9-]{36}$/i.test(id))throw Error("Explicit batch ID required");
  const db=await getDbClient();if(!db)throw Error("Unavailable");
  const batch=await db.from("coach_eval_batches").select("id,config,summary,status").eq("id",id).single();if(batch.error)throw Error("Batch unavailable");
  const result=await db.from("coach_eval_runs").select("id,run,status").eq("run->experiment->>batchId",id).order("created_at",{ascending:true}).limit(300);if(result.error)throw Error("Runs unavailable");
  const runs=(result.data||[]).map((r:{run:Record<string,any>})=>r.run);
  if(runs.some((r:Record<string,any>)=>r.status==="running"))throw Error("Batch still running; do not finalize partial metrics");
  const byStrategy:Record<string,any>={};
  const median=(values:number[])=>{const s=values.sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length?s.length%2?s[i]:(s[i-1]+s[i])/2:null;};
  for(const run of runs){
    const raw=run.result?.rawResponse||{},changes=raw.changes||[],source=run.input?.resume||"",answers=run.input?.answers||[];
    const qraw=raw.followUp||raw.recovery,question=qraw?nextResumeQuestion(source,qraw,answers):null;
    const format=typeof run.result?.output==="string"?checkResumeFormat(source,run.result.output,changes,run.experiment.formatPolicy):null;
    const stages=(run.spans||[]).filter((s:Record<string,any>)=>s.kind==="stage");
    const detail={source:"derived_from_captured_io",derivedAt:new Date().toISOString(),
      retainedChanges:changes.length,groundingBlocked:stages.filter((s:Record<string,any>)=>s.code==="proposals_checked").at(-1)?.output?.rejected?.length??null,
      formatRegressionCount:format?format.length:null,validSingleQuestion:qraw?Boolean(question):null,
      repeatedAnsweredQuestion:qraw&&answers.length?!question:null,
      supplementIncorporated:answers.length?coversCurrentResumeAnswer(changes,answers):null,
      repairConverged:run.metrics?.repairs>0?run.status==="completed"||run.status==="unchanged":null,
      changedCharCoverage:source.length?Math.min(1,changes.reduce((n:number,c:{before:string})=>n+c.before.length,0)/source.length):null,
      lengthRatio:source.length&&typeof run.result?.output==="string"?run.result.output.length/source.length:null,
      humanUsefulness:null,blindReviewStatus:"pending",factsVetoByIndependentHuman:null};
    run.metrics={...run.metrics,diagnostics:detail};
    const updated=await db.from("coach_eval_runs").update({run,updated_at:new Date().toISOString()}).eq("id",run.id);if(updated.error)throw Error("Metric save failed");
    const strategy=run.experiment.strategy;
    const row=byStrategy[strategy]||={n:0,completed:0,unchanged:0,needs_detail:0,failed:0,calls:0,inputTokens:0,outputTokens:0,estimatedCostUsd:0,wallValues:[],missingTokenRecords:0,missingCostRecords:0};
    row.n++;row[run.status]=(row[run.status]||0)+1;row.calls+=run.metrics.calls;
    if(run.metrics.inputTokens===null||run.metrics.outputTokens===null)row.missingTokenRecords++;
    else {row.inputTokens+=run.metrics.inputTokens;row.outputTokens+=run.metrics.outputTokens;}
    if(run.metrics.estimatedCostUsd===null)row.missingCostRecords++;else row.estimatedCostUsd+=run.metrics.estimatedCostUsd;
    row.wallValues.push(run.metrics.wallMs);
  }
  for(const row of Object.values(byStrategy) as any[]){row.medianWallMs=median(row.wallValues);delete row.wallValues;row.actualCost=null;row.note="同一版本的小样本描述；不能仅按交付率、耗时或规则分选冠军";}
  const summary={...batch.data.summary,byStrategy,decision:"not_release_ready",humanBlindReview:"pending",metricSource:"captured_real_runs",actualCost:null};
  if((await db.from("coach_eval_batches").update({summary,updated_at:new Date().toISOString()}).eq("id",id)).error)throw Error("Summary save failed");
  const root=`docs/architecture/evals/workflow-${id}`;await mkdir(root,{recursive:true});
  await writeFile(`${root}/summary.json`,JSON.stringify({batchId:id,config:batch.data.config,summary},null,2));
  const blind=`${root}/grok-blind`;await mkdir(blind,{recursive:true});
  const keys:Record<string,unknown>={};
  const inputs=[...new Set(runs.filter((r:Record<string,any>)=>r.experiment.repeat===1&&r.experiment.phase==="initial"&&r.experiment.formatPolicy==="preserve").map((r:Record<string,any>)=>r.experiment.fixtureId))];
  for(const fixtureId of inputs){
    const group=runs.filter((r:Record<string,any>)=>r.experiment.fixtureId===fixtureId&&r.experiment.repeat===1&&r.experiment.phase==="initial"&&r.experiment.formatPolicy==="preserve");
    group.sort((a:Record<string,any>,b:Record<string,any>)=>createHash("sha256").update(a.id).digest("hex").localeCompare(createHash("sha256").update(b.id).digest("hex")));
    const caseKey=createHash("sha256").update(String(fixtureId)).digest("hex").slice(0,10);
    const candidates=group.map((r:Record<string,any>,index:number)=>{const tag=String.fromCharCode(65+index);keys[`${caseKey}:${tag}`]={runId:r.id,strategy:r.experiment.strategy};return {tag,delivered:r.status==="completed"||r.status==="unchanged",text:typeof r.result?.output==="string"?r.result.output:null,question:r.result?.rawResponse?.followUp||r.result?.rawResponse?.recovery||null};});
    await writeFile(`${blind}/${caseKey}.json`,JSON.stringify({caseKey,synthetic:true,input:group[0]?.input,candidates},(key,value)=>key==="userId"||key==="user_id"?undefined:value,2));
  }
  await writeFile(`${root}/blind-answer-key.private.json`,JSON.stringify(keys,null,2),{mode:0o600});
  await writeFile(`${blind}/README.md`,"# Grok 盲评包\n\n仅阅读本目录的虚构样本JSON，不读父目录、答案键、策略、成本或既有评分。不改代码、不调用模型或业务/支付API、不部署。\n\n对每个匿名候选先判：事实越界/职责拔高/阶段混淆是否有硬风险，引用原文与候选片段；无法判断标unknown。再分别给0–4分和理由：内容选择与实际改善、具体动作和交付、整稿自洽、格式与原稿一致、不过度改写、提问的单一性/必要性。无数字不是缺陷，新增虚构数字是硬风险。未交付稿不编分，记录不可交付。不能用长度、术语或漂亮话替代价值判断。\n\n交换A/B/C顺序再评一次，保留分歧。只交判断和问题，不改稿。输出每caseKey/tag的维度、分数、证据、unknown、硬风险，以及顺序交换的一致性；写新review.json并交给Codex校准。尚未完成业务保存刷新/PDF验收，不能称可上线。\n");
  console.log(JSON.stringify({batchId:id,summary,blindDirectory:blind}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Failed");process.exitCode=1;});
