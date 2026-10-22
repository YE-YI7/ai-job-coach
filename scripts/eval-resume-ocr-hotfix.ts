/** Two fictional workflows only; no user gateway, task, answer or wallet writes.
 * EVAL_OCR_COST_ACK=1 EVAL_OCR_BATCH_ID=<uuid> npx tsx scripts/eval-resume-ocr-hotfix.ts
 * Uses the configured hosted provider, never user credentials. No whole-run retry. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {getDbClient} from '../lib/db';
import {runResumeDraft} from '../lib/coach-harness/resume-execution';
import {withEvalObserver,type EvalSpan} from '../lib/coach-harness/eval-scope';
import {applyResumeChanges} from '../lib/coach-harness/application-quality';
import {resumeRequestHash} from '../lib/coach-harness/resume-trace';
import {RESUME_WORKFLOW_VERSION} from '../lib/coach-harness/resume-document-review';

const fixtures=[
  {id:'ocr-repeat-and-metrics',resume:'# 林验收（虚构材料）\n## 校园经历\n模拟学院社团｜内容运营｜2025.03–2025.06\n- 平台运营：负责社团官方平台的内容容运营，累计发布通知32篇，实现关注人数增长18%月平均阅读量提升12%。\n## 教育经历\n模拟学院｜新闻学｜本科在读｜2023–2027'},
  {id:'ocr-ordinary-delivery',resume:'# 陈验收（虚构材料）\n## 实习经历\n模拟零售公司｜运营助理｜2025.06–2025.08\n- 实习期间，核对订单日期和发货状态，将异常记录在表表格中，交给主管跟进。每周把已记录的问题汇总成分类表供主管查看，没有统计处理效率。\n## 教育经历\n模拟学院｜电子商务｜本科在读｜2023–2027'},
];
async function main(){
  if(process.env.EVAL_OCR_COST_ACK!=='1'||process.env.LLM_STUB==='1')throw Error('Explicit two-workflow site-model permission required; stubs forbidden');
  if(!['stepfun','deepseek'].includes(process.env.HOSTED_LLM_PROVIDER||'')||!(process.env.HOSTED_LLM_PROVIDER==='stepfun'?process.env.STEPFUN_API_KEY:process.env.DEEPSEEK_API_KEY))throw Error('Exact hosted provider credentials required; Production Secrets may be unavailable locally. Do not fall back to a legacy provider.');
  const batch=process.env.EVAL_OCR_BATCH_ID||'';
  if(!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(batch))throw Error('Explicit batch UUID required');
  const actor=process.env.EVAL_OCR_OWNER_ID||'';
  if(!/^[\da-f-]{36}$/i.test(actor))throw Error('Existing private Eval owner required; no model called');
  const db=await getDbClient();if(!db)throw Error('Private capture unavailable; no model called');
  const owner=await db.from('coach_eval_runs').select('id').eq('user_id',actor).limit(1);
  if(owner.error||!owner.data?.length)throw Error('Existing Eval ownership not established; no model called');
  const sourceHash=createHash('sha256').update((await Promise.all(['lib/coach-harness/resume-execution.ts','lib/coach-harness/resume-diff.ts','lib/coach-harness/resume-document-review.ts'].map(p=>readFile(p,'utf8')))).join('\n')).digest('hex');
  let calls=0;
  for(const fixture of fixtures){
    const hex=createHash('sha256').update(batch+fixture.id).digest('hex').slice(0,32).split('');hex[12]='4';hex[16]='8';const h=hex.join('');
    const id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    const old=await db.from('coach_eval_runs').select('id').eq('id',id).maybeSingle();
    if(old.error||old.data)throw Error('Run already exists or lookup failed; do not repeat models');
    const spans:EvalSpan[]=[],started=Date.now();
    const run:Record<string,any>={id,label:`OCR热修验收 · ${fixture.id}`,source:'isolated_experiment',provenance:'real_site_model_fictional_input',status:'running',startedAt:new Date(started).toISOString(),workflow:RESUME_WORKFLOW_VERSION,sourceHash,input:{resume:fixture.resume,jobDescription:''},spans,stages:[],knowledge:[],evaluation:null,evaluationStatus:'not_requested',result:{status:'running'},limitations:['完全虚构材料；不调用本人TokenDance、不修改旧账号资料或积分。','本运行验证核心改稿/质检及Eval持久化，不冒充真人浏览器保存或PDF验收。']};
    const insert=await db.from('coach_eval_runs').insert({id,user_id:actor,label:run.label,status:'running',run});if(insert.error)throw Error('Capture insert failed; no duplicate model run');
    const save=async()=>{
      if(calls+spans.filter(s=>s.kind==='agent').length>8)throw Error('Two-workflow call cap exceeded');
      const r=await db.from('coach_eval_runs').update({status:run.status,run,legacy_trace_id:run.resumeTraceId||null,updated_at:new Date().toISOString()}).eq('id',id);
      if(r.error)throw Error('Private Eval capture failed');
    };
    try{
      const response=await withEvalObserver({spans,save},()=>runResumeDraft(new Request('https://eval.invalid/ocr-hotfix',{method:'POST',body:JSON.stringify({resumeText:fixture.resume,jobDescription:'',mode:'general_resume',requestId:`ocr-hotfix:${id}`})}),{id:actor} as any,{isolated:true}));
      const output=await response.json();
      const applied=output.ok?applyResumeChanges(fixture.resume,output.changes||[]):null;
      run.status=response.ok?(output.unchanged?'unchanged':'completed'):'failed';
      run.result={status:run.status,httpStatus:response.status,rawResponse:output,output:applied?.text||null};
      const trace=await db.from('product_events').select('properties').eq('user_id',actor).eq('event_name','resume_agent_trace').eq('properties->>requestHash',resumeRequestHash(`ocr-hotfix:${id}`)).maybeSingle();
      run.resumeTraceId=trace.data?.properties?.traceId||null;run.ruleQuality=trace.data?.properties?.quality||null;run.knowledge=trace.data?.properties?.retrieval||null;
      run.stages=spans.filter(s=>s.kind==='stage');
      run.acceptance={newPendingChanges:(output.changes||[]).filter((c:any)=>c.status==='pending').length,originalPreserved:run.input.resume===fixture.resume,ocrFixed:Boolean(applied&&!/内容容|表表格/.test(applied.text)),noNewEfficiencyClaim:!(/\d/.test(fixture.id==='ocr-ordinary-delivery'?(output.changes||[]).map((c:any)=>c.after).join(''):'')),pdfVerified:false,userDocumentPersistenceVerified:false};
    }catch(e){run.status='failed';run.result={status:'failed',error:e instanceof Error?e.message.slice(0,300):'unknown'};}
    run.durationMs=Date.now()-started;run.metrics={calls:spans.filter(s=>s.kind==='agent').length,inputTokens:spans.reduce((n,s)=>n+(s.usage?.inputTokens||0),0),outputTokens:spans.reduce((n,s)=>n+(s.usage?.outputTokens||0),0),actualCost:null};
    await save();
    const readback=await db.from('coach_eval_runs').select('run,status,legacy_trace_id').eq('id',id).single();
    const stored=readback.data?.run;
    if(readback.error||stored?.sourceHash!==sourceHash||!isDeepStrictEqual(stored?.result,run.result))throw Error('Eval persisted readback mismatch');
    console.log(JSON.stringify({id,traceId:run.resumeTraceId,status:run.status,elapsedMs:run.durationMs,...run.acceptance,...run.metrics,evalReadback:true}));
    calls+=spans.filter(s=>s.kind==='agent').length;
    if(run.status==='failed')throw Error('Workflow failed; stop, do not automatically retry or run second fixture');
  }
}
main().catch(e=>{console.error(JSON.stringify({error:e instanceof Error?e.message:'Unknown'}));process.exitCode=1;});
