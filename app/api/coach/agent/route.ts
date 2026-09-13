import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import { assertContextFits, renderContextForPrompt } from "@/lib/coach-harness";
import {LEARNING_SYSTEM,learningKnowledgeTask,makeLearningQuery,readLearningMemory,readLearningSession,refreshProfileMemory,boundedLearningPrompt} from "@/lib/coach-harness/learning-memory";
import {estimateTokens} from "@/lib/coach-harness/context";
import {isChatMode,parseTutorReply} from "@/lib/coach-harness/chat-options";
import {resolveChatModel,coolDownChatModel} from "@/lib/coach-harness/chat-models";

export const runtime = "nodejs";
export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };
async function history(userId: string, opportunityId: string | null, sessionId:string|null=null, limit=12) {
  const db = await getDbClient();
  if (!db) throw new Error("数据库不可用");
  let q = db.from("coach_agent_turns").select("id,question,answer,created_at,learning_trace").eq("user_id", userId);
  q = opportunityId ? q.eq("opportunity_id", opportunityId) : q.is("opportunity_id", null);
  q = sessionId ? q.eq("session_id",sessionId) : q.is("session_id",null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).reverse() as Array<{id:string;question:string;answer:string;created_at:string}>;
}
export async function GET(req: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
  const id = new URL(req.url).searchParams.get("opportunityId");
  const sessionId=new URL(req.url).searchParams.get("sessionId");
  if(sessionId&&!uuid.test(sessionId))return NextResponse.json({error:"会话无效"},{status:400,headers});
  if (id && !uuid.test(id)) return NextResponse.json({ error: "岗位无效" }, { status: 400, headers });
  try { return NextResponse.json({ ok: true, turns: await history(user.id, id,sessionId,200) }, { headers }); }
  catch { return NextResponse.json({ error: "暂时无法读取对话" }, { status: 503, headers }); }
}
async function handlePost(req: Request, onDelta?: (text:string)=>void) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400, headers }); }
  const id = body?.opportunityId ?? null;
  const mode=body?.modelMode??"auto";
  if(!isChatMode(mode))return NextResponse.json({error:"模型选项无效"},{status:400,headers});
  const sessionId=body?.sessionId??null;
  if(sessionId!==null&&(typeof sessionId!=="string"||!uuid.test(sessionId)))return NextResponse.json({error:"会话无效"},{status:400,headers});
  if ((id !== null && (typeof id !== "string" || !uuid.test(id))) || typeof body?.message !== "string" || !body.message.trim() || body.message.length > 4000 || !uuid.test(body.requestId || "")) {
    return NextResponse.json({ error: "请输入 1–4000 字的问题" }, { status: 400, headers });
  }
  const db = await getDbClient();
  if (!db) return NextResponse.json({ error: "数据库不可用，未开始生成" }, { status: 503, headers });
  const { data: existing, error: readError } = await db.from("coach_agent_turns").select("id,answer,opportunity_id,session_id,learning_trace").eq("user_id", user.id).eq("request_id", body.requestId).maybeSingle();
  if (readError) return NextResponse.json({ error: "读取状态失败" }, { status: 503, headers });
  if (existing) {const same=existing.opportunity_id===id&&(existing.session_id??null)===sessionId;return NextResponse.json(same?{ok:true,answer:existing.answer,id:existing.id,learning_trace:existing.learning_trace}:{error:"请求已用于其他会话"},{status:same?200:409,headers});}
  if(sessionId){const session=await readLearningSession(user.id,sessionId);if(!session||session.opportunity_id!==id||session.status!=="active")return NextResponse.json({error:"这次辅导已结束或不可访问，请开始新辅导"},{status:409,headers});}
  const [turns,learningMemory,profileMemory] = await Promise.all([
    history(user.id,id,sessionId),
    sessionId?readLearningMemory(user.id,id):Promise.resolve(""),
    sessionId?refreshProfileMemory(user.id):Promise.resolve(""),
  ]);
  let market="";
  if (/就业形势|行情|招聘趋势|就业市场|最新.*招聘/.test(body.message)) {
    const {data:updates,error} = await db.from("coach_market_updates").select("source_url,region,excerpt,checked_at").gte("checked_at",new Date(Date.now()-48*60*60*1000).toISOString()).limit(2);
    market=error||!updates?.length ? "没有 48 小时内验证的公开来源，明确告知尚无最新证据。" : updates.map((u:{source_url:string;region:string;excerpt:string;checked_at:string})=>`${u.region}\n来源 ${u.source_url}，抓取时间 ${u.checked_at}（不是发布日期）：\n${u.excerpt.slice(0,1800)}`).join("\n");
  }
  const retrievalQuery=makeLearningQuery(body.message,turns.map(t=>t.question));
  const context = await getContextBundleForUser({ userId:user.id, opportunityId:id, task:"mock_interview", currentInput:body.message, retrievalQuery, retrievalTask:learningKnowledgeTask(retrievalQuery), routeClass:"single_inference", budget:{maxInputTokens:4000}, knowledgeLimit:2 });
  assertContextFits(context);
  const rendered = renderContextForPrompt(context).text;
  // Always recompile private facts; never share a cached answer across users or jobs.
  const recent = turns.slice(-4).map(t => `用户：${t.question.slice(0,700)}\n导师（历史推断，非事实）：${t.answer.slice(0,1000)}`).join("\n");
  const prompt=boundedLearningPrompt(body.message,[`个人背景摘要：\n${profileMemory.slice(0,1800)}`,`以往学习进展：\n${learningMemory.slice(0,1800)}`,`本次近期对话：\n${recent}`,rendered,`市场证据（抓取时间不是发布日期，目录页不支持统计结论）：\n${market}`]);
  const fingerprint = createHash("sha256").update(user.id + ":" + id + ":" + prompt).digest("hex");
  let selection;
  try{selection=await resolveChatModel(user.id,mode,retrievalQuery);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"模型不可用"},{status:503,headers});}
  let modelUsage: {model:string;inputTokens:number;outputTokens:number;latencyMs:number;averageTokensPerSecond:number|null}|undefined;
  let received = false;
  let modelCalls = 0;
  const generate = async (model:string) => {
    modelCalls++;
    return callLLM([
    { role:"system",content:LEARNING_SYSTEM },
    { role:"user",content:prompt }
  ], {model,maxTokens:2400,maxRetries:0,timeout:45000,timeoutMs:45000,temperature:0.4,onUsage:details=>{modelUsage=details;},onDelta:onDelta?(text)=>{received=true;onDelta(text);}:undefined});
  };
  let rawAnswer;
  try { rawAnswer=await generate(selection.model); }
  catch(error) {
    // Never retry after showing text, or on authorization/balance failures.
    const message=error instanceof Error?error.message:"";
    if(mode!=="auto"||received||selection.model==="deepseek-v4-flash"||!/timed? ?out|timeout|abort|connection|502|503|504/i.test(message))throw error;
    coolDownChatModel(selection.model);
    selection.model="deepseek-v4-flash";
    rawAnswer=await generate(selection.model);
  }
  const {answer,suggestions}=parseTutorReply(rawAnswer);
  if (!answer.trim()) return NextResponse.json({error:"模型未返回内容"},{status:502,headers});
  const trace={promptVersion:"learning-v2",knowledgeIds:context.knowledge.map(k=>k.id),inputTokens:estimateTokens(LEARNING_SYSTEM)+estimateTokens(prompt),priorTurns:turns.slice(-4).map(t=>t.id),memoryLoaded:Boolean(learningMemory),profileLoaded:Boolean(profileMemory),modelCalls,suggestions,model:selection.model,modelUsage};
  const {data,error} = await db.from("coach_agent_turns").insert({user_id:user.id,opportunity_id:id,session_id:sessionId,request_id:body.requestId,question:body.message,answer,context_fingerprint:fingerprint,learning_trace:trace}).select("id").single();
  if(error) return NextResponse.json({error:"回答生成了，但未确认保存，请检查历史后重试"},{status:503,headers});
  return NextResponse.json({ok:true,answer,id:data.id,contextFingerprint:fingerprint,learning_trace:trace},{headers});
}

export async function POST(req:Request) {
  const metered=(onDelta?: (text:string)=>void)=>withMeteredAiRoute((request:Request)=>handlePost(request,onDelta),{operation:"cockpit_agent",quotaType:"chat"});
  if(!req.headers.get("accept")?.includes("application/x-ndjson"))return metered()(req);
  const encoder=new TextEncoder();
  let cancelled=false;
  const stream=new ReadableStream({
    async start(controller) {
      const emit=(event:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));};
      try {
        emit({type:"status",message:"正在读取相关材料…"});
        const response=await metered(text=>emit({type:"delta",text}))(req);
        const result=await response.json();
        // Completion is emitted only AFTER persistence and quota finalization.
        emit({type:"done",...result});
      } catch(error) {
        emit({type:"done",ok:false,error:error instanceof Error&&/TokenPay/.test(error.message)?error.message:"本次回答未完成，请保留问题并重试"});
      } finally {if(!cancelled)controller.close();}
    },
    cancel(){cancelled=true;},
  });
  return new Response(stream,{headers:{...headers,"Content-Type":"application/x-ndjson; charset=utf-8","X-Accel-Buffering":"no"}});
}
