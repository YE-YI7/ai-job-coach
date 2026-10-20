/** Synthetic samples only; no user endpoints, old workspaces, wallet or answers.
 * Plan by default. --execute requires EVAL_SITE_MODEL_COST_ACK=1.
 */
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resumeConversationFixtures} from '../evals/resume-conversation-fixtures';
import {resumeConversationMessages,parseResumeConversationDecision} from '../lib/coach-harness/resume-conversation-decision';
import {runWithGenerationContext} from '../lib/generation-context';
import {observedResumeLLM,withEvalObserver,redactEval,type EvalSpan} from '../lib/coach-harness/eval-observer';
import {runResumeDraft} from '../lib/coach-harness/resume-execution';
import {getDbClient} from '../lib/db';
import type {ResumeAgentAnswer} from '../lib/coach-harness/resume-task-types';
async function main(){
 const plan=resumeConversationFixtures.map(f=>({id:f.id,expected:f.expected,editor:'executeEditor' in f&&f.executeEditor}));
 if(!process.argv.includes('--execute')){console.log(JSON.stringify({samples:plan,maxLogicalCalls:16,noUserBilling:true}));return;}
 if(process.env.EVAL_SITE_MODEL_COST_ACK!=='1')throw Error('Site model cost acknowledgement required');
 const actor=(process.env.EVAL_ACTOR_ID||process.env.EVAL_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).find(Boolean);
 if(!actor||!/^[0-9a-f-]{36}$/i.test(actor))throw Error('Existing private Eval owner UUID required');
 const db=await getDbClient();if(!db)throw Error('Eval storage unavailable');
 const batch=randomUUID(),directory=`/tmp/yizhi-resume-conversation-eval-${batch}`;await mkdir(directory,{mode:0o700});
 const codeHash=createHash('sha256').update(await readFile('lib/coach-harness/resume-conversation-decision.ts','utf8')).digest('hex');
 let calls=0,failed=0;
 for(const fixture of resumeConversationFixtures){
  if(calls>=16)throw Error('Logical model budget exhausted');
  const id=randomUUID(),messageId=randomUUID(),start=Date.now(),spans:EvalSpan[]=[];
  const task={...fixture.task,conversation:[...('conversation' in fixture.task?fixture.task.conversation||[]:[]),{id:messageId,message:fixture.message,reply:'',status:'pending' as const,savedAt:new Date().toISOString()}]};
  const run:Record<string,any>={id,label:`导师决策回归 · ${fixture.id}`,source:'eval',provenance:'isolated_site_model',status:'running',startedAt:new Date(start).toISOString(),input:{resume:fixture.resume,jobDescription:'',message:fixture.message,question:task.question,conversation:task.conversation},spans,knowledge:[],result:{status:'running'},evaluation:null,evaluationStatus:'not_requested',experiment:{batchId:batch,fixtureId:fixture.id,fixtureHash:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),strategy:'mentor_decision',codeHash},limitations:['全部虚构材料、站点模型隔离运行；不调用原账号收费端点。','意图分类对照是规则验收，不冒充LLM自评分或录用效果。','实际账单、浏览器保存与PDF未在这个脚本内验证。']};
  const inserted=await db.from('coach_eval_runs').insert({id,user_id:actor,label:run.label,status:'running',run:redactEval(run)});if(inserted.error)throw Error('Cannot create private Eval record');
  const save=async()=>{if(calls+spans.filter(s=>s.kind==='agent').length>16)throw Error('Logical model budget exhausted before next call');const saved=await db.from('coach_eval_runs').update({status:run.status,run:redactEval(run),updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',actor);if(saved.error)throw Error('Eval persistence failed');};
  try{
   await withEvalObserver({spans,save},async()=>{
    const {messages,knowledge}=resumeConversationMessages({resume:fixture.resume,jd:'',changes:[]},task);run.knowledge=knowledge.map(k=>({id:k.id,title:k.title,included:true}));
    const raw=await runWithGenerationContext({operation:'resume_conversation',requestId:id,knowledgeDocumentIds:knowledge.map(k=>k.id)},()=>observedResumeLLM(messages,{provider:'deepseek',temperature:0,maxTokens:1400,reasoningBudgetTokens:2048,timeoutMs:45_000,maxRetries:0,responseFormat:'json_object'}));
    const decision=parseResumeConversationDecision(raw,fixture.resume,task.conversation);
    run.result={status:'completed',output:decision,rawResponse:decision};
    run.ruleQuality={expectedDecision:fixture.expected,actualDecision:decision.action,matched:decision.action===fixture.expected};
    if(decision.action!==fixture.expected)throw Error('Decision does not match expected intent');
    if('executeEditor' in fixture&&fixture.executeEditor){
     const answers:ResumeAgentAnswer[]=[{id:`instruction:${id}`,kind:'instruction',field:'context',sourceExcerpt:'',question:'导师确定的修改目标',answer:decision.editorBrief,savedAt:new Date().toISOString()}];
     if(decision.supplement)answers.push({id:`supplement:${id}`,field:decision.supplement.field,sourceExcerpt:decision.supplement.sourceExcerpt,question:'虚构用户补充',answer:decision.supplement.quote,claimId:randomUUID(),savedAt:new Date().toISOString()});
     const response=await runResumeDraft(new Request('https://eval.invalid/internal',{method:'POST',body:JSON.stringify({resumeText:fixture.resume,jobDescription:'',mode:'general_resume',requestId:`${id}:edit`})}),{id:actor} as any,{isolated:true,isolatedAnswers:answers});
     const output=await response.json();run.result.editor={httpStatus:response.status,output};
     if(!response.ok||!output.ok)throw Error('Selected editor execution failed');
    }
   });run.status='completed';
  }catch(error){run.status='failed';run.failure={message:error instanceof Error?error.message:'failed'};failed++;}
  const agents=spans.filter(s=>s.kind==='agent');calls+=agents.length;run.durationMs=Date.now()-start;
  const sum=(key:string)=>agents.every(s=>(s.usage as any)?.[key]!=null)?agents.reduce((n,s)=>n+Number((s.usage as any)[key]),0):null;
  run.metrics={wallMs:run.durationMs,calls:agents.length,inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),estimatedCostUsd:sum('estimatedCostUsd'),actualCost:null,pdfVerified:false,persistenceVerified:false};
  await save();await writeFile(`${directory}/${fixture.id}.json`,JSON.stringify(redactEval(run),null,2),{mode:0o600});
  console.log(JSON.stringify({id,fixture:fixture.id,status:run.status,...run.ruleQuality,...run.metrics,failure:run.failure||null}));
  if(agents.some(s=>s.status==='failed'&&/balance|insufficient_quota|API_KEY not found|401|Authentication/i.test(JSON.stringify(s.output))))break;
 }
 console.log(JSON.stringify({batch,directory,calls,failed}));if(failed)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Eval failed');process.exitCode=1;});
