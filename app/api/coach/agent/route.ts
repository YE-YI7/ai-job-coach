import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getContextBundleForUser, recordTierIntentFromText } from "@/lib/coach-harness/repository";
import { renderContextForPrompt } from "@/lib/coach-harness";
import {LEARNING_SYSTEM,LEARNING_PROMPT_VERSION,learningKnowledgeTask,makeLearningQuery,readLearningMemory,readLearningSession,refreshProfileMemory} from "@/lib/coach-harness/learning-memory";
import {estimateTokens} from "@/lib/coach-harness/context";
import {TUTOR_MATERIAL_VERSION,compileTutorPrompt,tutorMaterialFingerprintPayload,type TutorMaterialInput} from "@/lib/coach-harness/materials";
import {isChatMode,parseTutorReply} from "@/lib/coach-harness/chat-options";
import { readInboundEvents, renderInboundEventsForAgent } from "@/lib/coach-harness/run-ledger/events";
import {type GuardResult,type ProvidedMaterial} from "@/lib/coach-harness/insufficiency-guard";
import {harnessFingerprint,TUTOR_RETRIEVAL_CONFIG} from "@/lib/coach-harness/version-fingerprint";
import {resolveChatModel,coolDownChatModel} from "@/lib/coach-harness/chat-models";
import {runWithGenerationContext,getGenerationContext} from "@/lib/generation-context";
import {needsResumeGrounding,resumeSources,RESUME_GROUNDING_PROMPT,RESUME_GROUNDING_PROMPT_VERSION} from "@/lib/coach-harness/resume-grounding";
import {interviewMode,interviewSystem,renderInterview,INTERVIEW_CONTRACT_VERSION} from "@/lib/coach-harness/interaction-contract";
import {
  GUARD_SLOTS,
  GROUNDING_VERIFICATION_GUARD_ID,
  INSUFFICIENCY_GUARD_ID,
  registerDefaultGuards,
  runSlot,
  type GuardDecision,
  type Slot1Input,
  type Slot3Input,
  type Slot4Input,
} from "@/lib/coach-harness/guard-slots";
import type {OpportunityStage} from "@/lib/opportunities/types";
import {hasReviewMaterial} from "@/lib/interview/review-evidence";
import {chatFailureMessage,resolveCooldownRetry} from "@/lib/coach-harness/chat-failure";
import {resolveSavedJobReference} from "@/lib/coach-harness/job-reference";
import {createTutorStream,unwrapTutorAnswer} from "@/lib/coach-harness/tutor-stream";
import { readCompanyResearch, renderCompanyResearch } from "@/lib/coach-harness/research-runtime";
import { coachingStrategy, responseTime } from "@/lib/coach-harness/coaching-strategy";
import { finalizeTeachingReply, renderTeachingFrame, teachingFrame } from "@/lib/coach-harness/teaching-frame";
import { LEARNING_OUTCOME_VERSION, extractOutcomeTag, outcomeFromModel } from "@/lib/coach-harness/learning-outcome";
import { recordChatRequest } from "@/lib/coach-harness/request-telemetry";

export const runtime = "nodejs";
export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };
// 护栏四槽在本模块装配一次（幂等）；主链路只调 runSlot，不逐个点名守卫。
registerDefaultGuards();
/** 裁决 → 台账行：只留可断言的坐标（哪一槽、哪条守卫、什么裁决、什么理由码）。 */
function guardLedgerRows(decisions: GuardDecision[]) {
  return decisions.map((d) => ({ slot: d.slot, guardId: d.guardId, outcome: d.outcome, code: d.reason.code }));
}
function firstBlock(decisions: GuardDecision[]) {
  return decisions.find((d) => d.outcome === "block");
}
/** 精确输入仅供后台审计；不把大段重复的上下文回传给浏览器。 */
function publicTrace(trace: Record<string, unknown> | null | undefined) {
  if (!trace) return trace;
  const { compiledPrompt: privateSnapshot, ...rest } = trace;
  void privateSnapshot;
  return rest;
}
async function history(userId: string, opportunityId: string | null, sessionId:string|null=null, limit=12) {
  const db = await getDbClient();
  if (!db) throw new Error("数据库不可用");
  let q = db.from("coach_agent_turns").select("id,question,answer,created_at,learning_trace").eq("user_id", userId);
  q = opportunityId ? q.eq("opportunity_id", opportunityId) : q.is("opportunity_id", null);
  q = sessionId ? q.eq("session_id",sessionId) : q.is("session_id",null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data || []) as Array<{id:string;question:string;answer:string;created_at:string;learning_trace?:Record<string,unknown>|null}>)
    .reverse().map(row => ({ ...row, learning_trace: publicTrace(row.learning_trace) })) as Array<{id:string;question:string;answer:string;created_at:string;learning_trace?:{interactionMode?:string;proactive?:boolean;responseLatencyMs?:number|null;teaching?:import("@/lib/coach-harness/teaching-frame").TeachingTurn["teaching"]}|null}>;
}
/** 岗位档案里已保存的真实复盘与模拟记录——导师必须看得到，不能反问时装不知道。 */
async function interviewLedgerFor(db: Awaited<ReturnType<typeof getDbClient>>, userId: string, opportunityId: string | null): Promise<string> {
  if (!db || !opportunityId) return "";
  const { data, error } = await db.from("coach_opportunities").select("metadata").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
  if (error || !data?.metadata) return "";
  const meta = data.metadata as {
    reviewReports?: Array<{round?:string;grade?:string;overallComment?:string;improvements?:string[];sourceNotes?:string}>;
    mockInterviews?: Array<{round?:string;status?:string;summary?:{grade?:string;overallScore?:number;weaknesses?:string[]}}>;
  };
  const lines: string[] = [];
  for (const report of (meta.reviewReports || []).slice(0, 3)) {
    if (!report?.round) continue;
    if (report.grade === "待引导复盘" && report.sourceNotes?.trim()) {
      // 引导式复盘的原始面试记录：导师带练时必须看得到用户自己写下的内容。
      lines.push(`真实面试原始素材 · ${report.round}（用户自己记录、尚未复盘，引导追问围绕这段展开）：${report.sourceNotes.slice(0, 800)}`);
      continue;
    }
    if (!hasReviewMaterial(report.sourceNotes || "")) {
      lines.push(`真实面试 · ${report.round}：原始作答不足，旧评分已作废，不能据此判断能力。请围绕用户实际记得的问题和回答追问。`);
      continue;
    }
    const improvements = (report.improvements || []).slice(0, 3).join("；");
    lines.push(`真实面试复盘 · ${report.round}（${report.grade || "未评级"}）：${report.overallComment || ""}${improvements ? `；待改进：${improvements}` : ""}`);
  }
  for (const mock of (meta.mockInterviews || []).filter((item) => item?.status === "completed").slice(0, 3)) {
    const weaknesses = (mock.summary?.weaknesses || []).slice(0, 2).join("；");
    lines.push(`模拟面试 · ${mock.round || "未标轮次"}${mock.summary ? `（${[mock.summary.grade, mock.summary.overallScore!==undefined?`${mock.summary.overallScore} 分`:null].filter(Boolean).join(" · ")}）${weaknesses?`；短板：${weaknesses}`:""}` : "（已完成，无整轮总结）"}`);
  }
  return lines.join("\n");
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
async function handlePost(req: Request, onDelta?: (text:string)=>void, onStatus?: (message:string)=>void, onReplace?: (text:string)=>void) {
  const startedAt=Date.now();
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400, headers }); }
  const id = body?.opportunityId ?? null;
  const mode=body?.modelMode??"auto";
  if(body.interactionMode!==undefined&&!["coaching","mock_interview"].includes(body.interactionMode))return NextResponse.json({error:"辅导模式无效"},{status:400,headers});
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
  if (existing) {
    const same=existing.opportunity_id===id&&(existing.session_id??null)===sessionId;
    return NextResponse.json(same?{ok:true,answer:existing.answer,id:existing.id,
      needsMoreInput:existing.learning_trace?.insufficiency?.needsMoreInput??false,
      blocked:existing.learning_trace?.insufficiency?.blocked??false,
      stageSuggestion:existing.learning_trace?.stageSuggestion??null,
      learning_trace:publicTrace(existing.learning_trace)}:{error:"请求已用于其他会话"},{status:same?200:409,headers});
  }
  if(sessionId){const session=await readLearningSession(user.id,sessionId);if(!session||session.opportunity_id!==id||session.status!=="active")return NextResponse.json({error:"这次辅导已结束或不可访问，请开始新辅导"},{status:409,headers});}
  const groundedDraft=body.interactionMode!=="mock_interview"&&needsResumeGrounding(body.message);
  const reference = await resolveSavedJobReference(user.id, body.message);
  const contextId = reference.ambiguous.length ? null : reference.job?.id ?? id;
  if(id && contextId!==id){
    const scope=await db.from("coach_opportunities").select("id").eq("id",id).eq("user_id",user.id).maybeSingle();
    if(scope.error)return NextResponse.json({error:"读取当前工作区失败，请重试"},{status:503,headers});
    if(!scope.data)return NextResponse.json({error:"当前工作区不可访问"},{status:404,headers});
  }
  const referenceNote = reference.ambiguous.length
    ? `用户提及的岗位存在多个候选，请先让用户选择，不得拿当前岗位代替：${reference.ambiguous.map(j=>`${j.company} · ${j.role}`).join("；")}`
    : reference.job ? `本轮用户指名的已保存岗位：${reference.job.company} · ${reference.job.role}。使用下方已保存 JD，不要重复索要已有内容。会话仍属于原工作区，不更改岗位状态。` : "";
  // 用户在对话里说出的公司层次意向必须被接住：落成待确认偏好并留住原话出处，
  // 确认前不拿它剔岗位。这一步坏了不能影响本轮回答，所以只记日志。
  try { await recordTierIntentFromText({ userId: user.id, text: body.message, opportunityId: contextId }); }
  catch (error) { console.error("Tier intent capture failed", error); }
  const [{turns,context,selection},learningMemory,profileMemory] = await Promise.all([
    history(user.id,id,sessionId).then(async turns=>{
      const retrievalQuery=makeLearningQuery(body.message,turns.map(t=>t.question));
      const [context,selection]=await Promise.all([
        getContextBundleForUser({ userId:user.id, opportunityId:contextId, task:TUTOR_RETRIEVAL_CONFIG.task, currentInput:body.message, claimSelection:groundedDraft?"all_required":"relevant", retrievalQuery, retrievalTask:learningKnowledgeTask(retrievalQuery), routeClass:TUTOR_RETRIEVAL_CONFIG.routeClass, budget:{maxInputTokens:TUTOR_RETRIEVAL_CONFIG.maxInputTokens}, knowledgeLimit:TUTOR_RETRIEVAL_CONFIG.knowledgeLimit }),
        resolveChatModel(user.id,mode,retrievalQuery).catch(error=>({error})),
      ]);
      return {turns,context,selection};
    }),
    // Optional compaction/cache must not prevent a reply. The authoritative
    // context and session ownership checks above still fail closed.
    sessionId&&!groundedDraft?readLearningMemory(user.id,contextId).catch(()=>""):Promise.resolve(""),
    sessionId&&!groundedDraft?refreshProfileMemory(user.id).catch(()=>""):Promise.resolve(""),
  ]);
  let market="";
  if (/就业形势|行情|招聘趋势|就业市场|最新.*招聘/.test(body.message)) {
    const {data:updates,error} = await db.from("coach_market_updates").select("source_url,region,excerpt,checked_at").gte("checked_at",new Date(Date.now()-48*60*60*1000).toISOString()).limit(2);
    market=error||!updates?.length ? "没有 48 小时内验证的公开来源，明确告知尚无最新证据。" : updates.map((u:{source_url:string;region:string;excerpt:string;checked_at:string})=>`${u.region}\n来源 ${u.source_url}，抓取时间 ${u.checked_at}（不是发布日期）：\n${u.excerpt.slice(0,1800)}`).join("\n");
  }
  const rendered = renderContextForPrompt(context).text;
  const state = coachingStrategy(body.message, [...turns.slice(-7).map(t => t.learning_trace?.responseLatencyMs), responseTime(body.responseLatencyMs)], contextId || "general");
  // 本轮的目标、完成标准与终止判定先由服务端算好（来自用户原话 + 已落库轮次），
  // 再作为一条料交给模型：收不收口不取决于模型这一轮想不想继续讲。
  const frame = teachingFrame({
    message: body.message,
    turns: turns.map((t) => ({ id: t.id, question: t.question, answer: t.answer, proactive: t.learning_trace?.proactive === true, teaching: t.learning_trace?.teaching })),
  });
  // Only restore owner/job-bound successful research. A chat never starts a network fan-out.
  const researchJob = context.opportunity || reference.job;
  const research = researchJob ? renderCompanyResearch(await readCompanyResearch(user.id, researchJob).catch(() => null)) : "";
  const interviewLedger = await interviewLedgerFor(db, user.id, contextId).catch(() => "");
  // Always recompile private facts; never share a cached answer across users or jobs.
  const formatTurn = (t: (typeof turns)[number]) => `${t.learning_trace?.proactive?"辅导请求（系统事件，不是用户说过的话）":"用户"}：${t.question}\n导师（历史推断，非事实）：${t.answer}`;
  const pendingExchange = turns.length ? formatTurn(turns[turns.length - 1]) : "";
  const recent = turns.slice(-4, -1).map(formatTurn).join("\n");
  // 界面实时上下文：仅描述用户此刻在哪个页面、刚做了什么动作，供导师主动追问；
  // 它是操作日志不是事实来源，涉及结论仍以已保存的档案与证据为准。
  const savedEvents = await readInboundEvents({ userId: user.id, opportunityId: contextId, limit: 6 }).catch(() => []);
  const pageContext = [renderInboundEventsForAgent(savedEvents), typeof body?.pageContext === "string" ? body.pageContext : ""].filter(Boolean).join("\n\n");
  const sources = resumeSources(context);
  const priorMode=turns.at(-1)?.learning_trace?.interactionMode;
  const interviewer=!groundedDraft&&(body.interactionMode===undefined?interviewMode(body.message,priorMode):body.interactionMode==="mock_interview");
  const firstInterview=interviewer&&priorMode!=="mock_interview";
  // 每条料的预算与可信标注只在 TUTOR_MATERIALS 里声明一次，这里只负责供料。
  const materials: TutorMaterialInput[] = groundedDraft
    ? [
        { kind: "resume_sources", refId: "grounding-sources", text: JSON.stringify(sources) },
        ...(context.opportunity ? [{ kind: "job_reference_note" as const, refId: context.opportunity.id, text: `目标岗位（仅用于选择表达重点，不是候选人经历，禁止作为改写事实来源）：\n${JSON.stringify(context.opportunity)}` }] : []),
        ...context.knowledge.map(k => ({ kind: "knowledge_reference" as const, refId: k.id, text: k.content || "" })),
      ]
    : [
        referenceNote ? { kind: "job_reference_note", refId: contextId ?? undefined, text: referenceNote } : null,
        // 编译器已经决定过装什么，这里不许砍第二刀。
        { kind: "compiled_context", text: rendered },
        pendingExchange ? { kind: "pending_exchange", refId: turns[turns.length - 1].id, text: pendingExchange } : null,
        research ? { kind: "company_research", refId: contextId ?? undefined, text: research } : null,
        { kind: "coaching_strategy", text: state.text },
        { kind: "teaching_frame", refId: sessionId ?? undefined, text: renderTeachingFrame(frame) },
        pageContext ? { kind: "page_activity", text: pageContext } : null,
        profileMemory ? { kind: "profile_summary", text: profileMemory } : null,
        learningMemory ? { kind: "learning_progress", text: learningMemory } : null,
        recent ? { kind: "recent_turns", refId: turns.slice(-4).map(t => t.id).join(","), text: recent } : null,
        interviewLedger ? { kind: "interview_ledger", refId: contextId ?? undefined, text: interviewLedger } : null,
        market ? { kind: "market_evidence", text: market } : null,
      ].filter((m): m is TutorMaterialInput => Boolean(m))
       .filter(m=>!interviewer||!["teaching_frame","coaching_strategy"].includes(m.kind));
  const actualSystem=groundedDraft?RESUME_GROUNDING_PROMPT:interviewer?interviewSystem(firstInterview):LEARNING_SYSTEM;
  const compiled=compileTutorPrompt({system:actualSystem,question:body.message,materials});
  // 槽1 装配后准入：一次跑完「该不该问 / 该不该拒」，主链路不再内联任何容量判断。
  // 顺序就是注册顺序（装配容量 → 材料缺口 → grounding 分型 → 提示词保护区），
  // 先挡下来的是最靠近「材料本身」的原因，模型档位问题留到材料合格之后再说。
  const guardVerdicts: GuardDecision[] = [];
  const admission = runSlot<Slot1Input>(GUARD_SLOTS.postAssemblyAdmission, { bundle: context, message: body.message, prompt: compiled });
  guardVerdicts.push(...admission);
  const refused = firstBlock(admission);
  if (refused) return NextResponse.json({ error: refused.reason.code === "context_budget_exceeded"
    ? chatFailureMessage(new Error(refused.reason.message)) : refused.reason.message }, { status: (refused.data?.status as number) ?? 422, headers });
  if("error" in selection)return NextResponse.json({error:selection.error instanceof Error?selection.error.message:"模型不可用"},{status:503,headers});
  const actualPrompt=compiled.text;
  let modelUsage: {model:string;inputTokens:number;outputTokens:number;latencyMs:number;averageTokensPerSecond:number|null}|undefined;
  let received = false;
  let firstTextAt:number|null=null;
  let visibleTextAt:number|null=null;
  let generatedChars=0;
  let lastProgressAt=0;
  let modelCalls = 0;
  const fingerprint=createHash("sha256").update(user.id+":"+id+":"+actualSystem+actualPrompt).digest("hex");
  const contextReadyMs=Date.now()-startedAt;
  const userEvidence=`${body.message}\n${turns.slice(-4).map(t=>t.question).join("\n")}`;
  const streamText=createTutorStream(userEvidence,text=>{if(onReplace && frame.stage!=="closing"){visibleTextAt??=Date.now();onReplace(text);}});
  const generate = async (model:string) => {
    modelCalls++;
    onStatus?.(`正在等待 ${model} 响应…`);
    return runWithGenerationContext({...getGenerationContext(),userId:user.id,operation:"cockpit_agent",requestId:body.requestId,knowledgeDocumentIds:context.knowledge.map(k=>k.id)},()=>callLLM([
    { role:"system",content:actualSystem },
    { role:"user",content:actualPrompt }
  ], {model,maxTokens:groundedDraft?1800:2400,reasoningBudgetTokens:groundedDraft||interviewer?2048:undefined,maxRetries:0,timeout:mode==="auto"?45000:60000,timeoutMs:mode==="auto"?45000:60000,firstTokenTimeoutMs:mode==="auto"?8000:35000,temperature:groundedDraft?0:0.4,responseFormat:groundedDraft||interviewer?"json_object":undefined,onUsage:details=>{modelUsage=details;},onDelta:onDelta&&!groundedDraft&&!interviewer?(text)=>{received=true;firstTextAt??=Date.now();generatedChars+=text.length;streamText(text);if(Date.now()-lastProgressAt>=1000){lastProgressAt=Date.now();onStatus?.(`导师正在回答，已生成 ${generatedChars} 字符…`);}}:undefined}));
  };
  let rawAnswer:string;
  // 换档事实只有这里知道：`selection.model` 会被改写成应答模型，台账里的
  // `model` 字段事后看不出这一轮换过。auto 档下前端也没有可对比的「用户选的档」，
  // 所以 from→to 必须显式随 done 事件下发——静默换档是产品红线。
  let modelSwap:{from:string;to:string}|null=null;
  try { rawAnswer=await generate(selection.model); }
  catch(error) {
    // Never retry after showing text, or on authorization/balance failures.
    // 换哪一档由失败语义表决定，档位取 model-catalog 的经济档常量，不写死模型字面量。
    const retryTo=resolveCooldownRetry({mode,receivedText:received,currentModel:selection.model,error});
    if(!retryTo)throw error;
    coolDownChatModel(selection.model);
    modelSwap={from:selection.model,to:retryTo};
    selection.model=retryTo;
    rawAnswer=await generate(retryTo);
  }
  if(interviewer){
    try{rawAnswer=renderInterview(rawAnswer,firstInterview);}
    catch{return NextResponse.json({error:chatFailureMessage(new Error("模拟面试未满足一次一题要求"))},{status:422,headers});}
  }
  // 槽3 落库前核验·第一道：简历复核链路的事实回指。回指不上就不落库、不出稿。
  // 只有真走了 grounding 链路才供这一份输入——取不到输入的守卫会 pass(input_absent)。
  const groundingChecks = runSlot<Slot3Input>(GUARD_SLOTS.prePersistenceVerification, { grounding: groundedDraft ? { raw: rawAnswer, sources } : undefined });
  guardVerdicts.push(...groundingChecks);
  const groundingFailed = firstBlock(groundingChecks);
  if (groundingFailed) return NextResponse.json({ error: chatFailureMessage(new Error(groundingFailed.reason.message)) }, { status: (groundingFailed.data?.status as number) ?? 422, headers });
  if (groundedDraft) rawAnswer = String((groundingChecks.find((d) => d.guardId === GROUNDING_VERIFICATION_GUARD_ID)!.data as { draft: string }).draft);
  // 成果草稿是正文之外的独立标签：先摘出来，正文与它各走各的核验，标签都不外露给用户。
  const outcomeTag = groundedDraft ? { text: rawAnswer, draft: null as ReturnType<typeof extractOutcomeTag>["draft"], malformed: false } : extractOutcomeTag(rawAnswer);
  const parsed=parseTutorReply(unwrapTutorAnswer(outcomeTag.text));
  // 槽3 落库前核验·第二道：信息不足分级——blocking 轮的超长“伪完整”回答收敛为一句
  // 澄清问句；无依据的“已确认/已掌握”类断言就地降级为待确认。纯字符串级，不触网。
  // 只认「这次真的进了提示词的原文」——被预算舍弃的材料不算已提供（FR-21）。
  const inPrompt = (kind: "opportunity" | "attachment", refId?: string) =>
    context.selection.included.some((e) => e.kind === kind && (refId === undefined || e.refId === refId));
  const jdTextInPrompt = !groundedDraft && inPrompt("opportunity") ? context.opportunity?.jdText?.trim() || "" : "";
  const resumeTextInPrompt = inPrompt("attachment", "resume-text")
    ? context.attachments.find((a) => a.id === "resume-text")?.text?.trim() || ""
    : "";
  const providedMaterials: ProvidedMaterial[] = [
    jdTextInPrompt ? { kind: "jd", text: jdTextInPrompt } : null,
    resumeTextInPrompt ? { kind: "resume", text: resumeTextInPrompt } : null,
  ].filter((x): x is ProvidedMaterial => Boolean(x));
  const replyChecks = runSlot<Slot3Input>(GUARD_SLOTS.prePersistenceVerification, {
    reply: { answer: parsed.answer, suggestions: parsed.suggestions, userText: `${body.message}\n${turns.slice(-4).map((t) => t.question).join("\n")}`, providedMaterials },
  });
  guardVerdicts.push(...replyChecks);
  const guarded = (replyChecks.find((d) => d.guardId === INSUFFICIENCY_GUARD_ID)!.data as unknown as { legacy: GuardResult }).legacy;
  // 模拟也必须经过反幻觉守卫，不能因使用专门协议绕过事实核验。
  const {answer,suggestions}=interviewer?{answer:guarded.answer,suggestions:[]}:finalizeTeachingReply(frame, guarded);
  if (!answer.trim()) return NextResponse.json({error:"模型未返回内容"},{status:502,headers});
  if(onDelta){if(visibleTextAt!==null&&onReplace)onReplace(answer);else{visibleTextAt=Date.now();onDelta(answer);}onStatus?.("回答已核对，正在保存…");}
  // 成果草稿在这里定稿：本轮 turn id 由调用方先生成，标签里的尝试证据才指得回自己。
  // answerDraft 只从用户原话里取，模型没有输入口（§8.2「模型示范不能混进去」）。
  const turnId = randomUUID();
  const lastAttempt = [...turns].reverse().find((t) => frame.attemptTurnIds.includes(t.id));
  const builtOutcome = outcomeTag.draft
    ? outcomeFromModel(outcomeTag.draft, {
        sessionId: sessionId ?? "",
        attempts: frame.currentIsAttempt ? [...frame.attemptTurnIds, turnId] : frame.attemptTurnIds,
        answerDraft: frame.currentIsAttempt ? body.message : lastAttempt?.question ?? "",
        goal: frame.goal,
        criterionVersion: frame.criterionVersion,
        scenarioAudited: frame.scenarioAudited,
        feedbackText: outcomeTag.text,
        requiredCriterionParts: frame.intent==="learn"?["mechanism","boundary"]:frame.intent==="practice"?["answer"]:["facts"],
      })
    : null;
  const outcome = builtOutcome?.ok ? builtOutcome.outcome : null;
  const outcomeNote = builtOutcome
    ? builtOutcome.ok ? builtOutcome.note : builtOutcome.copy
    : outcomeTag.malformed ? "本轮的成果草稿没有通过校验，本次未形成可保存成果；正文与原回答仍然保留。" : null;
  // 版本联合指纹：这一轮的「哪个版本」必须可拆成五个组件（FR-34）。
  // 台账里只存哈希，不存提示词正文与知识正文。
  const promptVersion=groundedDraft?RESUME_GROUNDING_PROMPT_VERSION:interviewer?INTERVIEW_CONTRACT_VERSION:LEARNING_PROMPT_VERSION;
  const interactionMode=interviewer?"mock_interview":"coaching";
  const harness=harnessFingerprint({promptVersion,systemPrompt:actualSystem,retrieval:{...TUTOR_RETRIEVAL_CONFIG,materials:tutorMaterialFingerprintPayload()}});
  // FR-33：这一轮模型真看见了哪些料、哪些被砍过、哪些整条没进——台账必须能还原。
  const trace={promptVersion,interactionMode,harness,groundedDraft,proactive:body.proactive===true?true:undefined,timing:{contextReadyMs,firstTextMs:visibleTextAt===null?null:visibleTextAt-startedAt,modelFirstTextMs:firstTextAt===null?null:firstTextAt-startedAt,generationDoneMs:Date.now()-startedAt},knowledgeIds:context.knowledge.map(k=>k.id),knowledgeExclusions:context.selection.excluded.filter(x=>x.kind==="knowledge").map(x=>({id:x.refId,reason:x.reason})),materials:{version:TUTOR_MATERIAL_VERSION,budgetTokens:compiled.budgetTokens,usedTokens:compiled.usedTokens,injected:compiled.injected,excluded:compiled.excluded,partialNotices:compiled.partialNotices},inputTokens:estimateTokens(actualSystem)+estimateTokens(actualPrompt),priorTurns:turns.slice(-4).map(t=>t.id),memoryLoaded:Boolean(learningMemory),profileLoaded:Boolean(profileMemory),modelCalls,suggestions,model:selection.model,modelSwap:modelSwap??undefined,modelUsage,insufficiency:{level:guarded.level,needsMoreInput:guarded.needsMoreInput,blocked:guarded.blocked,collapsed:guarded.collapsed,downgradedRedundantAsk:guarded.downgradedRedundantAsk,providedMaterials:providedMaterials.map(m=>m.kind),claimsHedged:guarded.claimsHedged},teaching:{goal:frame.goal,criterion:frame.criterion,criterionSatisfied:!!outcome && outcome.observedStatus!=="未独立检验" && !outcome.openIssue,intent:frame.intent,stage:frame.stage,criterionVersion:frame.criterionVersion,priorAttempts:frame.attemptTurnIds.length,currentIsAttempt:frame.currentIsAttempt,scenarioAudited:frame.scenarioAudited},outcome:outcome??undefined,outcomeVersion:outcome?LEARNING_OUTCOME_VERSION:undefined,outcomeNote:outcomeNote??undefined,guards:guardLedgerRows(guardVerdicts)};
  const observation = { stateObservation: state.product, responseLatencyMs: responseTime(body.responseLatencyMs) };
  const {data,error} = await db.from("coach_agent_turns").insert({id:turnId,user_id:user.id,opportunity_id:id,session_id:sessionId,request_id:body.requestId,question:body.message,answer,context_fingerprint:fingerprint,learning_trace:{...trace,...observation,compiledPrompt:actualPrompt}}).select("id").single();
  if(error) return NextResponse.json({error:"回答生成了，但未确认保存，请检查历史后重试"},{status:503,headers});
  // 用户在对话里说出的真实动作（"我投了""约到二面了"）→ 只生成"建议"，不直接改写阶段：
  // 正则识别无法区分陈述与假设，推进岗位状态必须由用户点头。
  // 槽4 落库后事件：守卫结构上没有推进能力（只读原话 + 阶段快照，裁决只有 no_advance）。
  // 它发生在写库之后，所以不进本轮台账，而是随响应回到界面等用户点头。
  let stageSnapshot: OpportunityStage | undefined;
  if (id && contextId === id && !reference.ambiguous.length) stageSnapshot = await currentStageOf(db, user.id, id);
  const postChecks = runSlot<Slot4Input>(GUARD_SLOTS.postPersistenceEvent, { message: body.message, currentStage: stageSnapshot });
  let stageSuggestion = (postChecks.find((d) => d.outcome === "no_advance")?.data as { suggestion?: string } | undefined)?.suggestion ?? null;
  if (stageSuggestion) {
    // 重放必须恢复同一确认条；建议落库失败时不发一条无法恢复的确认请求。
    const { error: suggestionError } = await db.from("coach_agent_turns").update({ learning_trace: {
      ...trace, ...observation, compiledPrompt: actualPrompt, stageSuggestion, guards: [...trace.guards, ...guardLedgerRows(postChecks)],
    } }).eq("id", data.id).eq("user_id", user.id);
    if (suggestionError) { stageSuggestion = null; console.error("Stage suggestion was not persisted"); }
  }
  return NextResponse.json({ok:true,answer,id:data.id,contextFingerprint:fingerprint,needsMoreInput:guarded.needsMoreInput,blocked:guarded.blocked,stageSuggestion,outcome:outcome??null,outcomeNote:outcomeNote??null,learning_trace:trace},{headers});
}

async function currentStageOf(db: NonNullable<Awaited<ReturnType<typeof getDbClient>>>, userId: string, opportunityId: string): Promise<OpportunityStage> {
  const { data } = await db.from("coach_opportunities").select("stage").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
  return (data?.stage as OpportunityStage) ?? "captured";
}

export async function POST(req:Request) {
  const requestStart=Date.now();
  const user=await getCurrentUserFromRequest();
  const requestBody=await req.clone().json().catch(()=>null);
  const requestId=typeof requestBody?.requestId==="string"?requestBody.requestId:"";
  const record=(event:"started"|"completed"|"failed"|"interrupted", trace?:{harness?:{combined?:string};timing?:{firstTextMs?:number|null}})=>user
    ? recordChatRequest(user.id,requestId,event,{opportunity_id:requestBody?.opportunityId||null,harness_version:trace?.harness?.combined,
        first_text_ms:trace?.timing?.firstTextMs,duration_ms:Date.now()-requestStart}) : Promise.resolve();
  if(user)await record("started");
  const metered=(onDelta?: (text:string)=>void,onStatus?: (message:string)=>void,onReplace?: (text:string)=>void)=>{
    const run=withMeteredAiRoute((request:Request)=>handlePost(request,onDelta,onStatus,onReplace),{operation:"cockpit_agent",quotaType:"chat",firstCoaching:true});
    return async(request:Request)=>{
      try { const response=await run(request);const body=await response.clone().json().catch(()=>null);
        await record(body?.ok?"completed":"failed",body?.learning_trace);return response;
      }catch(error){await record("failed");throw error;}
    };
  };
  if(!req.headers.get("accept")?.includes("application/x-ndjson"))return metered()(req);
  const encoder=new TextEncoder();
  let cancelled=false;
  const stream=new ReadableStream({
    async start(controller) {
      const emit=(event:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));};
      try {
        emit({type:"status",message:"正在读取相关材料…"});
        // Only guarded text crosses the wire; status events carry no draft text.
        let shown=false;
        const response=await metered(text=>{shown=true;emit({type:"delta",text});},message=>emit({type:"status",message}),text=>{shown=true;emit({type:"replace",text});})(req);
        const result=await response.json();
        if(!shown&&result?.ok&&typeof result.answer==="string")emit({type:"delta",text:result.answer});
        // Completion is emitted only AFTER persistence and quota finalization.
        emit({type:"done",...result});
      } catch(error) {
        emit({type:"done",ok:false,error:chatFailureMessage(error)});
      } finally {if(!cancelled)controller.close();}
    },
    cancel(){cancelled=true;void record("interrupted");},
  });
  return new Response(stream,{headers:{...headers,"Content-Type":"application/x-ndjson; charset=utf-8","X-Accel-Buffering":"no"}});
}
