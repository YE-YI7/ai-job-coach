"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import Image from "next/image";
import useQuotaLabel from "./useQuotaLabel";
import {assertGenerationQuota} from "@/lib/quota-preflight";
import {ArrowUp,Copy,Plus,BookOpen} from "@phosphor-icons/react";
import styles from "./AgentConversation.module.css";
import TutorMarkdown from "./TutorMarkdown";
import VoiceControls from "./VoiceControls";
import ModelPicker from "./ModelPicker";
import SelectMenu from "@/components/ui/SelectMenu";
import {type ChatMode} from "@/lib/coach-harness/chat-options";
import {catalogWithAvailability,type CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import {readChatResponse} from "@/lib/coach-harness/chat-stream";
import {persistPendingAnswer,restorePendingAnswer,clearPendingAnswer,pendingAnswerStore} from "./pending-answer";
import {STAGE_STATUS_WORDS} from "@/lib/opportunities/timeline";
import type {OpportunityStage} from "@/lib/opportunities/types";
import {turnIntervention,insufficiencyFromTrace,type InsufficiencyTrace} from "./tutor-intervention";
import {modelTurnNotice,isAcknowledged,rememberAcknowledged,type ModelTurnNotice} from "./model-change";
import TaskRunTray from "./TaskRunTray";
import OutcomeCard from "./OutcomeCard";
import {canShowTutorInvitation} from "./tutor-invitation";
import type {LearningOutcome} from "@/lib/coach-harness/learning-outcome";
type Turn={id:string;question:string;answer:string;learning_trace?:{interactionMode?:"coaching"|"mock_interview";suggestions?:string[];model?:string;modelCalls?:number;proactive?:boolean;insufficiency?:InsufficiencyTrace|null;outcome?:LearningOutcome|null;outcomeNote?:string|null;modelUsage?:{model:string;inputTokens:number;outputTokens:number;averageTokensPerSecond:number|null}}};
type Session={id:string;title:string;status:"active"|"archived";summary?:string};
export type CoachingStart={id:string;title:string;prompt:string;opportunityId?:string;proactive?:boolean};
export type TutorInvitation={id:string;text:string;title:string;prompt:string};
async function archiveRemote(sessionId:string){
 const r=await fetch("/api/coach/agent/archive",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({sessionId})});
 const b=await r.json();if(!b.ok)throw Error(b.error||"保存进展失败");return b;
}
export default function AgentConversation({opportunityId,label,enabled=true,startRequest,onStartConsumed,onArchived,onStageAdvanced,chatContext,opening,invitation}:{opportunityId?:string;label:string;enabled?:boolean;startRequest?:CoachingStart|null;onStartConsumed?:(id:string)=>void;onArchived?:()=>void;onStageAdvanced?:(stage:OpportunityStage)=>void|Promise<boolean>;chatContext?:string;opening?:{text:string;prompts:string[]};invitation?:TutorInvitation|null}){
 const [dismissedInvitations,setDismissedInvitations]=useState<string[]>([]);
 const [outreach,setOutreach]=useState<TutorInvitation|null>(null);
 const [turns,setTurns]=useState<Turn[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sessions,setSessions]=useState<Session[]>([]),[session,setSession]=useState<Session|null>(null);
 const [pending,setPending]=useState("");
 const [interactionMode,setInteractionMode]=useState<"coaching"|"mock_interview">("coaching");
 // Restore the mode of the selected lesson rather than leaking it across jobs.
 useEffect(()=>{setInteractionMode(turns.at(-1)?.learning_trace?.interactionMode??"coaching");},[session?.id,turns.at(-1)?.id]);
 const quotaLabel=useQuotaLabel("chat",busy);
 const [pendingProactive,setPendingProactive]=useState(false);
 const [draft,setDraft]=useState("");
 const [progress,setProgress]=useState("");
 const [failedLesson,setFailedLesson]=useState<{text:string;title?:string}|null>(null);
 const [stageSuggestion,setStageSuggestion]=useState<OpportunityStage|null>(null);
 // W6-② 模型换档确认：升档未确认前拦住下一次发送；同一次换法确认过就不再反复拦。
 const [modelNotice,setModelNoticeState]=useState<ModelTurnNotice|null>(null);
 const confirmGate=useRef<ModelTurnNotice|null>(null);
 const setModelNotice=useCallback((notice:ModelTurnNotice|null)=>{confirmGate.current=notice&&notice.requiresConfirm?notice:null;setModelNoticeState(notice);},[]);
 const ackStore=useCallback(():{getItem(k:string):string|null;setItem(k:string,v:string):void}=>({getItem:k=>{try{return localStorage.getItem(k);}catch{return null;}},setItem:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}}),[]);
 const [savingStage,setSavingStage]=useState(false);
 const [savingNote,setSavingNote]=useState<string|null>(null),[savedNotes,setSavedNotes]=useState<Set<string>>(new Set());
 async function saveNote(turn:Turn){
  if(savingNote)return;setSavingNote(turn.id);setError("");
  try{const r=await fetch("/api/coach/agent/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({note:true,title:turn.question.slice(0,120)||"导师回答",summary:turn.answer,opportunityId,sourceTurnId:turn.id})});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"笔记保存失败");setSavedNotes(s=>new Set(s).add(turn.id));}
  catch(e){setError(e instanceof Error?e.message:"笔记保存失败");}finally{setSavingNote(null);}
 }
 const [modelMode,setModelModeState]=useState<ChatMode>(()=>{try{return (localStorage.getItem("yi-zhi.chat-model") as ChatMode)||"auto";}catch{return "auto";}});
 const setModelMode=useCallback((mode:ChatMode)=>{setModelModeState(mode);try{localStorage.setItem("yi-zhi.chat-model",mode);}catch{}},[]);
 const [modelAccess,setModelAccess]=useState<{connected:boolean;available:string[];catalog:CatalogEntryAvailability[]}|null>(null);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch("/api/coach/agent/models",{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then(b=>{if(!b.ok)return;const available:string[]=Array.isArray(b.available)?b.available:[];const catalog=Array.isArray(b.catalog)&&b.catalog.length?b.catalog as CatalogEntryAvailability[]:catalogWithAvailability(available);setModelAccess({connected:!!b.connected,available,catalog});}).catch(()=>{});return()=>controller.abort();},[enabled]);
 const generation=useRef(0),lock=useRef(false),seen=useRef(new Set<string>());
 const jumpToLatest=useRef(false),lastTurn=useRef<HTMLDivElement|null>(null);
 const retry=useRef<import("./pending-answer").PendingAnswer|null>(null);
 useEffect(()=>{if(pending&&retry.current?.interactionMode)setInteractionMode(retry.current.interactionMode);},[pending,session?.id]);
 const answerReceivedAt=useRef<number|null>(null);
 const [researchNote,setResearchNote]=useState("");
 useEffect(()=>{
  answerReceivedAt.current=null;setResearchNote("");
  if(!enabled||!opportunityId)return;
  const abort=new AbortController();
  void fetch("/api/coach/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId}),signal:abort.signal})
   .then(async r=>{const b=await r.json();if(!abort.signal.aborted)setResearchNote(b.result?"公司公开资料已读取，导师将带出处使用；未交叉验证。":b.note||b.error||"");})
   .catch(()=>{if(!abort.signal.aborted)setResearchNote("公司调研暂未完成，不影响基于简历与 JD 辅导。");});
  return()=>abort.abort();
 },[enabled,opportunityId]);
 const list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const incoming=useRef<HTMLDivElement>(null);
 const [readingHeight,setReadingHeight]=useState(300);
 const [sendSequence,setSendSequence]=useState(0);
 const scope=opportunityId?"opportunityId="+opportunityId:"";
 useEffect(()=>{
  if(!enabled||!opportunityId||busy||loading||message.trim()||!turns.length)return;
  const abort=new AbortController();
  const timer=window.setTimeout(()=>{
   void fetch("/api/coach/outreach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId,userIsTyping:false}),signal:abort.signal})
    .then(r=>r.json()).then(b=>{if(!abort.signal.aborted&&b.invitation)setOutreach(b.invitation);}).catch(()=>{});
  },15000);
  return()=>{window.clearTimeout(timer);abort.abort();};
 },[enabled,opportunityId,busy,loading,message,turns.length]);
 const candidateInvitation=invitation||outreach;
 const activeInvitation=candidateInvitation&&canShowTutorInvitation({turnCount:turns.length,busy,loading,pending,message,dismissed:dismissedInvitations.includes(candidateInvitation.id)})?candidateInvitation:null;
 useEffect(()=>{
  const token=++generation.current;lock.current=false;setFailedLesson(null);setOutreach(null);
  jumpToLatest.current=false;
  setTurns([]);setMessage("");setError("");setPending("");setPendingProactive(false);setDraft("");setStageSuggestion(null);setModelNotice(null);setBusy(false);setSession(null);setSessions([]);setLoading(true);
  if(!enabled){setLoading(false);return;}
  const controller=new AbortController();
  fetch("/api/coach/agent/sessions?"+scope,{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then(async b=>{
   if(token!==generation.current)return;
   if(!b.ok)throw Error(b.error||"无法找回学习记录");
   setSessions(b.sessions);const active=b.sessions.find((s:Session)=>s.status==="active");
if(active){jumpToLatest.current=true;setSession(active);const r=await fetch("/api/coach/agent?"+scope+"&sessionId="+active.id,{cache:"no-store",signal:controller.signal});const h=await r.json();if(!h.ok)throw Error(h.error);if(token===generation.current)setTurns(h.turns);const saved=await restorePendingAnswer(active.id,[],controller.signal);if(token===generation.current&&saved){retry.current=saved;setMessage(saved.text);setPending(saved.text);}}
  }).catch(e=>{if(token===generation.current&&!controller.signal.aborted)setError(e.message||"网络异常，请刷新找回记录");}).finally(()=>{if(token===generation.current)setLoading(false);});
  return()=>{generation.current=token+1;controller.abort();};
 },[scope,enabled,setModelNotice]);
 useEffect(()=>{const node=list.current;if(!node)return;const observer=new ResizeObserver(()=>setReadingHeight(node.clientHeight));observer.observe(node);return()=>observer.disconnect();},[]);
 // Anchor once per submitted message, not once per token. The reserved answer
 // area keeps this position stable as the stream grows and is committed.
 useLayoutEffect(()=>{const node=list.current,answer=incoming.current;if(node&&answer)node.scrollTop+=answer.getBoundingClientRect().top-node.getBoundingClientRect().top;},[sendSequence,session?.id]);
 // 切换岗位/学习记录后历史加载完成时定位一次到最新一条，避免停在最早的消息；
 // 只在真正渲染出最后一条时消费该标记，流式更新不再抢滚动。
 useLayoutEffect(()=>{
  if(loading||!jumpToLatest.current)return;
  const node=list.current,latest=lastTurn.current;
  if(latest&&node){jumpToLatest.current=false;node.scrollTop+=latest.getBoundingClientRect().top-node.getBoundingClientRect().top;}
  else if(!turns.length)jumpToLatest.current=false;
 },[loading,turns]);
 useEffect(()=>{if(!message&&input.current)input.current.style.height="";},[message]);
 const send=useCallback(async(text:string,newLesson=false,title?:string,proactive=false)=>{
  if(lock.current||!text.trim()||!enabled||loading)return;
  // 上一轮被检测到升档且还没确认：先确认再继续，不做静默计费。
  if(confirmGate.current)return;
  lock.current=true;const token=generation.current;jumpToLatest.current=false;setBusy(true);setError("");setFailedLesson(null);setPending(text);setPendingProactive(proactive);setDraft("");setProgress("正在连接导师…");setMessage(m=>m.trim()===text.trim()?"":m);setSendSequence(n=>n+1);
  try{
   let selected=session;
   // Starting a separate lesson must not depend on a paid AI archive succeeding.
   // The earlier session remains accessible in learning history.
   if(newLesson||!selected||selected.status==="archived"){
    const r=await fetch("/api/coach/agent/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId,title:title||text.slice(0,80)})});const b=await r.json();
    if(!b.ok)throw Error(b.error||"开课失败");if(token!==generation.current)return;
    selected=b.session;setSession(b.session);setSessions(s=>[b.session,...s]);setTurns([]);
   }
   const requestId=retry.current?.text===text&&retry.current.sessionId===selected!.id?retry.current.requestId:crypto.randomUUID();
   const effectiveMode=retry.current?.text===text&&retry.current.sessionId===selected!.id?retry.current.interactionMode??interactionMode:interactionMode;
   retry.current={text,sessionId:selected!.id,requestId,interactionMode:effectiveMode};
   if(!proactive){setProgress("先保存你的回答…");await persistPendingAnswer(retry.current);if(token!==generation.current)return;setProgress("回答已保存，正在连接导师…");}
   await assertGenerationQuota("chat",fetch,{sessionId:selected!.id});if(token!==generation.current)return;
   const responseLatencyMs=answerReceivedAt.current===null?undefined:performance.now()-answerReceivedAt.current;
   const r=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/x-ndjson","x-idempotency-key":requestId},body:JSON.stringify({opportunityId,sessionId:selected!.id,message:text,requestId,modelMode,interactionMode:effectiveMode,proactive:proactive||undefined,pageContext:chatContext||undefined,responseLatencyMs})});
   const b=await readChatResponse<Turn&{ok?:boolean;error?:string;stageSuggestion?:OpportunityStage|null}>(r,value=>{if(token===generation.current)setDraft(value);},value=>{if(token===generation.current)setProgress(value);});
   if(token!==generation.current)return;
   if(!b.ok){
    // A confirmed failed attempt has a refunded/closed reservation. A new attempt
    // needs a fresh billing key; an unknown network outcome retains the old key.
    if(!proactive){retry.current={text,sessionId:selected!.id,requestId:crypto.randomUUID(),interactionMode:effectiveMode};await persistPendingAnswer(retry.current);}
    throw Error(b.error||"回答暂时不可用");
   }
   clearPendingAnswer(pendingAnswerStore(),selected!.id);retry.current=null;
   window.dispatchEvent(new Event("yizhi-quota-changed"));
   // Failure to clean up must not turn a confirmed turn into a failed answer.
   void fetch("/api/coach/agent/pending",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:selected!.id,requestId})}).catch(()=>{});
   answerReceivedAt.current=performance.now();
   setDraft("");
   setTurns(t=>t.some(x=>x.id===b.id)?t:[...t,{id:b.id,question:text,answer:b.answer,learning_trace:b.learning_trace}]);setPending("");
   if(b.stageSuggestion)setStageSuggestion(b.stageSuggestion);
   const notice=modelTurnNotice({modelMode,trace:b.learning_trace});
   if(notice&&!isAcknowledged(ackStore(),notice))setModelNotice(notice);
  }catch(e){if(token===generation.current){setError(e instanceof Error?e.message:"网络异常，请检查历史后重试");if(proactive)setFailedLesson({text,title});else setMessage(m=>m||text);}}
  finally{if(token===generation.current){setBusy(false);lock.current=false;}}
 },[enabled,loading,opportunityId,session,modelMode,interactionMode,chatContext,ackStore,setModelNotice]);
 useEffect(()=>{if(startRequest&&startRequest.opportunityId===opportunityId&&!loading&&enabled&&!seen.current.has(startRequest.id)&&!lock.current){seen.current.add(startRequest.id);onStartConsumed?.(startRequest.id);input.current?.focus({preventScroll:true});void send(startRequest.prompt,true,startRequest.title,startRequest.proactive===true);}},[startRequest,loading,enabled,send,opportunityId,busy,onStartConsumed]);
 async function archive(){
  if(!session||lock.current||!turns.length)return false;lock.current=true;setBusy(true);setError("");const token=generation.current;
  try{const b=await archiveRemote(session.id);if(token!==generation.current)return false;const closed={...session,status:"archived" as const,summary:b.summary};setSession(closed);setSessions(s=>s.map(x=>x.id===closed.id?closed:x));onArchived?.();return true;}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"保存复盘失败，原对话仍保留");return false;}
  finally{if(token===generation.current){lock.current=false;setBusy(false);}}
 }
 async function selectSession(id:string){
  if(lock.current)return;const target=sessions.find(s=>s.id===id);if(!target)return;
  const token=++generation.current;jumpToLatest.current=true;setLoading(true);setError("");setFailedLesson(null);setSession(target);setTurns([]);setMessage("");setDraft("");setPending("");setModelNotice(null);
  try{const r=await fetch("/api/coach/agent?"+scope+(id==="legacy"?"":"&sessionId="+id),{cache:"no-store"});const b=await r.json();if(token!==generation.current)return;if(!b.ok)throw Error(b.error);setTurns(b.turns);const saved=await restorePendingAnswer(target.id);if(token===generation.current&&saved){retry.current=saved;setMessage(saved.text);setPending(saved.text);}}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"读取失败");}finally{if(token===generation.current)setLoading(false);}
 }
 return <section className={styles.panel} aria-label="对话辅导">
  <header><strong className={styles.mentorIdentity}><Image src="/logo.png" alt="" width={28} height={28}/>AI 求职导师</strong><button type="button" title="新开对话，原记录保留在学习记录中" disabled={busy||loading} onClick={()=>{setSession(null);setTurns([]);setMessage("");setDraft("");setPending("");setError("");setFailedLesson(null);setModelNotice(null);input.current?.focus({preventScroll:true});}}><Plus size={16}/>新辅导</button></header>
  <div className={styles.metadata}><p className={styles.context} title={label}>{label}</p>
  {!!sessions.length&&<label className={styles.history}>学习记录<SelectMenu className={styles.historyMenu} value={session?.id||""} disabled={busy||loading} onChange={v=>void selectSession(v)} ariaLabel="选择学习记录" placeholder="新的辅导" options={[{value:"",label:"新的辅导"},...sessions.map(s=>({value:s.id,label:`${s.status==="archived"?"已归档":"继续"} · ${s.title.slice(0,36)}`}))]} /></label>}
  </div>
  <div className={styles.modeSwitch} role="group" aria-label="导师模式">
   <button type="button" aria-pressed={interactionMode==="coaching"} disabled={busy||loading||!!pending} onClick={()=>setInteractionMode("coaching")}>教练 · 讲解与反馈</button>
   <button type="button" aria-pressed={interactionMode==="mock_interview"} disabled={busy||loading||!!pending} onClick={()=>setInteractionMode("mock_interview")}>面试官 · 一次一题</button>
  </div>
  <TaskRunTray enabled={enabled}/>
  {researchNote&&<p className={styles.proactiveNote} role="status">{researchNote}</p>}
  <div ref={list} className={styles.messages} role="log" aria-label="辅导对话" aria-live="polite">
  {activeInvitation&&!message.trim()&&!busy&&!dismissedInvitations.includes(activeInvitation.id)&&<section className={styles.teachingInvite} aria-label="导师的练习邀请"><p>{activeInvitation.text}</p><div><button disabled={!enabled||busy||loading} onClick={()=>{setDismissedInvitations(ids=>[...ids,activeInvitation.id]);void send(activeInvitation.prompt,true,activeInvitation.title,true);}}>好，带我练这题</button><button onClick={()=>setDismissedInvitations(ids=>[...ids,activeInvitation.id])}>稍后</button></div>{!enabled&&<small>预览邀请；登录后可开始真实带练。</small>}</section>}
   {loading?<p>正在找回学习记录…</p>:!turns.length&&!pending&&(!invitation||dismissedInvitations.includes(invitation.id))?<div className={styles.welcome}><BookOpen size={26}/><h3>我们从这里开始</h3><p>{opening?.text||"告诉我你正在准备什么，我会带你完成下一步。"}</p><div className={styles.quickStarts}>{opening?.prompts.map(prompt=><button key={prompt} type="button" disabled={!enabled||busy} onClick={()=>void send(prompt)}>{prompt}</button>)}</div>{!enabled&&<p>当前为预览；登录后可以开始真实辅导。</p>}</div>:turns.map((t,index)=><div key={t.id} ref={index===turns.length-1?lastTurn:null}>{t.learning_trace?.proactive?<p className={styles.proactiveNote}>导师主动来问你了</p>:<p className={styles.question}>{t.question}</p>}<div className={styles.answer} style={index===turns.length-1&&!pending?{minHeight:readingHeight}:undefined}><TutorMarkdown>{t.answer}</TutorMarkdown>{(()=>{const note=turnIntervention(insufficiencyFromTrace(t.learning_trace));return note?<p className={styles.interventionNote}>{note.text}</p>:null;})()}<button type="button" aria-label="复制导师回答" onClick={()=>void navigator.clipboard.writeText(t.answer).catch(()=>setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button>
   {t.learning_trace?.outcome&&<OutcomeCard outcome={t.learning_trace.outcome} note={t.learning_trace.outcomeNote??null} turnId={t.id} opportunityId={opportunityId} disabled={!enabled}/>}
   {!t.learning_trace?.outcome&&t.learning_trace?.outcomeNote&&<p className={styles.interventionNote}>{t.learning_trace.outcomeNote}</p>}
   {t.learning_trace?.model&&<details className={styles.usage}><summary>{t.learning_trace.modelUsage?.model||t.learning_trace.model}{t.learning_trace.modelUsage?` · ${t.learning_trace.modelUsage.inputTokens+t.learning_trace.modelUsage.outputTokens} tokens${t.learning_trace.modelUsage.averageTokensPerSecond!==null?` · ${t.learning_trace.modelUsage.averageTokensPerSecond} tokens/s`:""}`:" · 用量未返回"}</summary>{t.learning_trace.modelUsage&&<p>输入 {t.learning_trace.modelUsage.inputTokens} / 输出 {t.learning_trace.modelUsage.outputTokens} tokens。速率是输出 tokens ÷ 请求耗时，包含等待，不是扣费倍率。</p>}<a href="https://tokendance.space/models" target="_blank" rel="noreferrer">TokenPay 实时价格（以账单为准）</a></details>}
   {index===turns.length-1&&!busy&&!loading&&session?.status!=="archived"&&!!t.learning_trace?.suggestions?.length&&<div className={styles.quickStarts} aria-label="继续这个问题">{t.learning_trace.suggestions.filter(q=>!/^(你|您|说说|谈谈|试着|请你|请您)/.test(q.trim())).slice(0,2).map(q=><button key={q} type="button" disabled={!enabled} onClick={()=>void send(q)}>{q}</button>)}</div>}
   <button type="button" disabled={!enabled||savingNote!==null||savedNotes.has(t.id)} onClick={()=>void saveNote(t)}><BookOpen size={14}/>{savedNotes.has(t.id)?"已加入我的笔记":savingNote===t.id?"正在保存…":"加入我的笔记"}</button>
   {index===turns.length-1&&turns.length>=3&&session?.status==="active"&&<button type="button" disabled={busy||loading} onClick={()=>void archive()}>整理这次练习进展（AI 额度）</button>}
   </div></div>)}
   {pending&&!pendingProactive&&<p className={styles.question}>{pending}</p>}
   {pending&&<div ref={incoming} className={styles.answer} style={{minHeight:readingHeight}}>{draft&&<TutorMarkdown>{draft}</TutorMarkdown>}{busy?<p className={styles.streamStatus} role="status">{progress||"正在连接导师…"}</p>:<><p role="status">导师反馈尚未确认保存，原回答已恢复到输入框。</p><button type="button" disabled={loading||!enabled} onClick={()=>void send(message.trim()||pending)}>继续这次回答</button></>}</div>}
   {busy&&!pending&&<p role="status">导师正在整理进展…</p>}
   {stageSuggestion&&!busy&&<div className={styles.stageConfirm} role="group" aria-label="确认岗位状态"><span>{`听起来你已经「${STAGE_STATUS_WORDS[stageSuggestion]||stageSuggestion}」了——只有你点头、且云端保存成功我才改岗位状态：`}</span><button type="button" disabled={savingStage} onClick={async()=>{setSavingStage(true);try{if(await onStageAdvanced?.(stageSuggestion)!==false)setStageSuggestion(null);}finally{setSavingStage(false);}}}>{savingStage?"正在保存…":"更新状态"}</button><button type="button" disabled={savingStage} onClick={()=>setStageSuggestion(null)}>先不</button></div>}
   {session&&session.id!=="legacy"&&(session.summary||(session.status==="active"&&turns.length>0))&&<details className={styles.summary}><summary>本轮收获</summary>{session.summary?<TutorMarkdown>{session.summary}</TutorMarkdown>:<p>对话里值得下次带走的收获、难点和练习，整理后会存在这里。</p>}
    {session.status==="active"&&turns.length>0&&<button disabled={busy} onClick={()=>void archive()}>整理本次进展（AI 额度）</button>}</details>}
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {failedLesson&&<button type="button" disabled={busy||loading} onClick={()=>void send(failedLesson.text,false,failedLesson.title,true)}>重新开始这题辅导</button>}
  {modelNotice&&<div className={styles.modelConfirm} role="group" aria-label="模型档位说明"><span>{modelNotice.text}</span><button type="button" onClick={()=>{rememberAcknowledged(ackStore(),modelNotice);setModelNotice(null);}}>{modelNotice.requiresConfirm?"知道了，继续":"知道了"}</button>{modelNotice.requiresConfirm&&modelMode!=="fast"&&<button type="button" onClick={()=>{rememberAcknowledged(ackStore(),modelNotice);setModelMode("fast");setModelNotice(null);}}>换回实惠档</button>}</div>}
  <form onSubmit={e=>{e.preventDefault();void send(message.trim());}}>
   <textarea ref={input} aria-label="给导师的消息" placeholder="写下你的回答，或直接说没听懂…" rows={2} maxLength={4000} disabled={!enabled} value={message} onChange={e=>{setMessage(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,112)+"px";}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(message.trim());}}}/>
   <footer><ModelPicker value={modelMode} onChange={setModelMode} catalog={modelAccess?.catalog??catalogWithAvailability([])} connected={modelAccess?.connected??false} disabled={busy||loading||!enabled}/><VoiceControls key={`${opportunityId||"general"}:${session?.id||"new"}`} value={message} onChange={setMessage} readText={turns.at(-1)?.answer} disabled={!enabled||busy||loading}/><button aria-label="发送消息" disabled={busy||loading||!enabled||!message.trim()||!!(modelNotice&&modelNotice.requiresConfirm)} type="submit"><ArrowUp size={18}/></button></footer>
  </form>
  <p className={styles.disclaimer}>{quotaLabel} / 每条 AI 回答。保存回答和笔记免费；失败释放额度。AI 也会犯错，请核实重要信息。</p>
 </section>;
}
