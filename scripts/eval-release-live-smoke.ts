// Explicit opt-in live smoke; synthetic inputs only, never touches a user account.
import {randomUUID} from "node:crypto";
import {callLLM} from "../lib/llm";
import {runWithGenerationContext} from "../lib/generation-context";
import {LEARNING_SYSTEM,LEARNING_PROMPT_VERSION} from "../lib/coach-harness/learning-memory";
import {teachingFrame,renderTeachingFrame,finalizeTeachingReply,type TeachingTurn} from "../lib/coach-harness/teaching-frame";
import {parseTutorReply} from "../lib/coach-harness/chat-options";
import {unwrapTutorAnswer} from "../lib/coach-harness/tutor-stream";
import {extractOutcomeTag,outcomeFromModel} from "../lib/coach-harness/learning-outcome";
async function main(){
 if(process.env.RUN_LIVE_RELEASE_SMOKE!=="1")throw Error("Set RUN_LIVE_RELEASE_SMOKE=1 to make at most 10 real model calls");
 if(process.env.LLM_STUB==="1")throw Error("Stub is not live acceptance");
 const cases=[
  {id:"confusion-to-attempt",messages:["这段 RAG 原理我看了很久还是没有理解，能不能换一个简单例子讲讲","我还是不懂，能不能就解释召回率分母","我的理解是：分母是标注集里全部相关材料，分子是检索实际找回的相关材料。例如相关材料共10条找回8条，召回率是80%","懂了"]},
  {id:"switch-and-revise",messages:["讲讲 RAG 的评估口径","先不学了，帮我改简历这句话","我主要负责需求文档和工单归类，没有做开发。请用这两个真实动作给我一句简历草稿，不加数字"]},
  {id:"criterion-covered",messages:["带我练一道 Agent 分工题：只练角色边界，不需要新的迁移场景","我的答案：资料 Agent 只负责检索和给出处，写作 Agent 只基于出处起草。检索失败就明确返回缺资料，不让写作 Agent 补造事实，结果由用户确认","先这样，够了"]},
 ];
 const results=await Promise.all(cases.map(async item=>{
  const turns:TeachingTurn[]=[];const rows:unknown[]=[];
  for(const message of item.messages){
   const frame=teachingFrame({message,turns});const id=randomUUID();
   let usage:unknown=null;const started=Date.now();
   const answer=await runWithGenerationContext({operation:"qa_release_live_smoke",requestId:id},()=>callLLM([
    {role:"system",content:LEARNING_SYSTEM},
    {role:"user",content:`本次是虚构测试，不是个人经历。\n${renderTeachingFrame(frame)}\n历史：\n${turns.map(t=>`用户：${t.question}\n导师：${t.answer}`).join("\n")}\n当前用户：${message}`},
   ],{provider:"deepseek",model:"deepseek-v4-flash",maxTokens:900,temperature:0.4,maxRetries:0,timeoutMs:45000,onUsage:value=>{usage=value;}}));
   const tagged=extractOutcomeTag(answer);
   const built=tagged.draft?outcomeFromModel(tagged.draft,{sessionId:"",attempts:frame.currentIsAttempt?[...frame.attemptTurnIds,id]:frame.attemptTurnIds,answerDraft:frame.currentIsAttempt?message:turns.findLast(t=>frame.attemptTurnIds.includes(t.id))?.question||"",goal:frame.goal,criterionVersion:frame.criterionVersion,scenarioAudited:false,feedbackText:tagged.text,requiredCriterionParts:frame.intent==="learn"?["mechanism","boundary"]:frame.intent==="practice"?["answer"]:["facts"]}):null;
   const satisfied=!!built?.ok&&built.outcome.observedStatus!=="未独立检验"&&!built.outcome.openIssue;
   const final=finalizeTeachingReply(frame,parseTutorReply(unwrapTutorAnswer(tagged.text)));
   turns.push({id,question:message,answer:final.answer,teaching:{...frame,criterionSatisfied:satisfied}});
   rows.push({message,frame,answer:final.answer,rawModel:tagged.text,outcome:built,latencyMs:Date.now()-started,usage});
  }
  return {id:item.id,rows};
 }));
 console.log(JSON.stringify({date:new Date().toISOString(),promptVersion:LEARNING_PROMPT_VERSION,synthetic:true,kind:"live model smoke, not human semantic calibration",results},null,2));
}
main().catch(error=>{console.error(String(error?.message||error));process.exitCode=1;});
