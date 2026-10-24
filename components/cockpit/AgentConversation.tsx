"use client";
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import useQuotaLabel from "./useQuotaLabel";
import {assertGenerationQuota} from "@/lib/quota-preflight";
import {ArrowUp,Copy,Plus,BookOpen,DotsThree} from "@phosphor-icons/react";
import styles from "./AgentConversation.module.css";
import TutorMarkdown from "./TutorMarkdown";
import VoiceControls from "./VoiceControls";
import ModelPicker from "./ModelPicker";
import ResumeComposerModel from "./ResumeComposerModel";
import SelectMenu from "@/components/ui/SelectMenu";
import {isChatMode,type ChatMode} from "@/lib/coach-harness/chat-options";
import {catalogWithAvailability,type CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import {readChatResponse} from "@/lib/coach-harness/chat-stream";
import {persistPendingAnswer,restorePendingAnswer,clearPendingAnswer,pendingAnswerStore} from "./pending-answer";
import {chatRequestSignal,withChatRequestDeadline} from "./chat-request-deadline";
import {STAGE_STATUS_WORDS} from "@/lib/opportunities/timeline";
import type {OpportunityStage} from "@/lib/opportunities/types";
import {turnIntervention,insufficiencyFromTrace,type InsufficiencyTrace} from "./tutor-intervention";
import {modelTurnNotice,isAcknowledged,rememberAcknowledged,type ModelTurnNotice} from "./model-change";
import TaskRunTray from "./TaskRunTray";
import OutcomeCard from "./OutcomeCard";
import MentorDeliverable from "./MentorDeliverable";
import {continuationDraft,readContinuation,writeContinuation} from "./mentor-continuation";
import {canShowTutorInvitation} from "./tutor-invitation";
import type {LearningOutcome} from "@/lib/coach-harness/learning-outcome";
import { companionBinding, companionVisibleText, companionRetryText } from "@/lib/coach-harness/companion-protocol";
type Turn={id:string;question:string;answer:string;learning_trace?:{interactionMode?:"coaching"|"mock_interview";suggestions?:string[];model?:string;modelCalls?:number;proactive?:boolean;insufficiency?:InsufficiencyTrace|null;outcome?:LearningOutcome|null;outcomeNote?:string|null;modelUsage?:{model:string;inputTokens:number;outputTokens:number;averageTokensPerSecond:number|null}}};
type ScopedTurn=Turn&{opportunity_id?:string|null};
type Session={id:string;title:string;status:"active"|"archived";summary?:string;opportunity_id?:string|null};
export type CoachingStart={id:string;title:string;prompt:string;opportunityId?:string;proactive?:boolean};
export type TutorInvitation={id:string;text:string;title:string;prompt:string};
async function archiveRemote(sessionId:string){
 const r=await fetch("/api/coach/agent/archive",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({sessionId})});
 const b=await r.json();if(!b.ok)throw Error(b.error||"保存进展失败");return b;
}
export default function AgentConversation({opportunityId,label,enabled=true,startRequest,onStartConsumed,onArchived,onStageAdvanced,chatContext,opening,invitation,jobLabels={},resumeWorkflow,resumeContext=false}:{opportunityId?:string;label:string;jobLabels?:Record<string,string>;enabled?:boolean;startRequest?:CoachingStart|null;onStartConsumed?:(id:string)=>void;onArchived?:()=>void;onStageAdvanced?:(stage:OpportunityStage,opportunityId?:string)=>void|Promise<boolean>;chatContext?:string;opening?:{text:string;prompts:string[]};invitation?:TutorInvitation|null;resumeWorkflow?:{key:string;content:React.ReactNode};resumeContext?:boolean}){
 const [resumeGuided,setResumeGuided]=useState(Boolean(resumeWorkflow));
 const workflowKey=resumeWorkflow?.key,startId=startRequest?.id;
 useEffect(()=>{if(workflowKey)setResumeGuided(true);},[workflowKey]);
 useEffect(()=>{if(startId)setResumeGuided(false);},[startId]);
 const guidedOpen=Boolean(resumeWorkflow&&resumeGuided);
 const [dismissedInvitations,setDismissedInvitations]=useState<string[]>([]);
 const [outreach,setOutreach]=useState<TutorInvitation|null>(null);
 const [turns,setTurns]=useState<ScopedTurn[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [owner,setOwner]=useState<string|null>(null),[resumeEntry,setResumeEntry]=useState(false);
 const stageTarget=useRef<string|undefined>(undefined);
 const pendingTarget=useRef<string|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sessions,setSessions]=useState<Session[]>([]),[session,setSession]=useState<Session|null>(null);
 const [pending,setPending]=useState("");
 const [interactionMode,setInteractionMode]=useState<"coaching"|"mock_interview">("coaching");
 const lastTurnMode=turns.at(-1)?.learning_trace?.interactionMode,lastTurnId=turns.at(-1)?.id;
 useEffect(()=>{setInteractionMode(lastTurnMode??"coaching");},[session?.id,lastTurnId,lastTurnMode]);
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
 async function saveNote(turn:ScopedTurn){
  if(savingNote)return;setSavingNote(turn.id);setError("");
  try{const r=await fetch("/api/coach/agent/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({note:true,title:companionVisibleText(turn.question).slice(0,120)||"导师回答",summary:turn.answer.slice(0,6000),opportunityId:turn.opportunity_id??null,sourceTurnId:turn.id})});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"笔记保存失败");setSavedNotes(s=>new Set(s).add(turn.id));}
  catch(e){setError(e instanceof Error?e.message:"笔记保存失败");}finally{setSavingNote(null);}
 }
 // Match the server's first render, then restore the browser preference before
 // session loading enables sends. Reading it in the initializer mismatches the
 // visible model name during hydration when a non-default model was saved.
 const [modelMode,setModelModeState]=useState<ChatMode>("auto");
 useEffect(()=>{try{const saved=localStorage.getItem("yi-zhi.chat-model");setModelModeState(isChatMode(saved)?saved:"auto");}catch{/* Keep auto without overwriting an inaccessible preference. */}},[]);
 const setModelMode=useCallback((mode:ChatMode)=>{setModelModeState(mode);try{localStorage.setItem("yi-zhi.chat-model",mode);}catch{}},[]);
 const [modelAccess,setModelAccess]=useState<{connected:boolean;catalog:CatalogEntryAvailability[]}|null>(null);
 const modelCatalog=modelAccess?.catalog??catalogWithAvailability([]);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch("/api/coach/agent/models",{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then(b=>{if(!b.ok||controller.signal.aborted)return;const available:string[]=Array.isArray(b.available)?b.available:[];setModelAccess({connected:!!b.connected,catalog:Array.isArray(b.catalog)&&b.catalog.length?b.catalog:catalogWithAvailability(available)});}).catch(()=>{});return()=>controller.abort();},[enabled]);
 const generation=useRef(0),lock=useRef(false),seen=useRef(new Set<string>());
 const jumpToLatest=useRef(false),lastTurn=useRef<HTMLDivElement|null>(null);
 const retry=useRef<import("./pending-answer").PendingAnswer|null>(null);
 useEffect(()=>{if(pending&&retry.current?.interactionMode)setInteractionMode(retry.current.interactionMode);},[pending,session?.id]);
 const answerReceivedAt=useRef<number|null>(null);
 // 公司调研只有在这里触发（/api/coach/agent 自己不会跑），删掉这段导师就只剩 JD 原文可用。
 // 界面上不再显示调研状态，所以结果不落地成 state。
 useEffect(()=>{
  answerReceivedAt.current=null;
  if(!enabled||!opportunityId)return;
  const abort=new AbortController();
  void fetch("/api/coach/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId}),signal:abort.signal}).catch(()=>{});
  return()=>abort.abort();
 },[enabled,opportunityId]);
 const list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const historyBox=useRef<HTMLDetailsElement>(null);
 const settingsTrigger=useRef<HTMLButtonElement>(null),settingsMenu=useRef<HTMLDivElement>(null);
 const settingsId=useId(),[settingsOpen,setSettingsOpen]=useState(false);
 // Native top-layer popover avoids clipping in the scrollable mentor panel.
 useEffect(()=>{
  const element=settingsMenu.current;if(!element)return;
  const sync=(event:Event)=>setSettingsOpen((event as ToggleEvent).newState==="open");
  const dismiss=(event:Event)=>{if(!(event.target instanceof Node)||!element.contains(event.target))element.hidePopover();};
  element.addEventListener("toggle",sync);window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
  return()=>{element.removeEventListener("toggle",sync);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);};
 },[]);
 function toggleSettings(){
  const element=settingsMenu.current,trigger=settingsTrigger.current;if(!element||!trigger)return;
  if(element.matches(":popover-open")){element.hidePopover();trigger.focus();return;}
  (element.showPopover as (options:{source:HTMLElement})=>void).call(element,{source:trigger});
  const rect=trigger.getBoundingClientRect(),{width,height}=element.getBoundingClientRect(),below=rect.bottom+8;
  element.style.left=`${Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))}px`;
  element.style.top=`${Math.max(12,Math.min(below+height<=window.innerHeight-12?below:rect.top-height-8,window.innerHeight-height-12))}px`;
  element.querySelector<HTMLSelectElement>("select")?.focus({preventScroll:true});
 }
 // 历史对话展开后必须能退出：点框外任意处或按 Esc 收起。
 // 弹层是异步加载到会话列表后才渲染的，所以节点在事件里现取，不在挂载时抓死。
 useEffect(()=>{
  const dismiss=(event:Event)=>{const box=historyBox.current;if(box?.open&&!box.contains(event.target as Node))box.open=false;};
  const onKey=(event:KeyboardEvent)=>{const box=historyBox.current;if(event.key==="Escape"&&!event.defaultPrevented&&box?.open){event.preventDefault();box.open=false;box.querySelector("summary")?.focus();}};
  document.addEventListener("pointerdown",dismiss,true);
  window.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("pointerdown",dismiss,true);window.removeEventListener("keydown",onKey);};
 },[]);
 const incoming=useRef<HTMLDivElement>(null);
 const [readingHeight,setReadingHeight]=useState(300);
 const [sendSequence,setSendSequence]=useState(0);

 const historyUrl=(s:Session)=>s.id.startsWith("legacy")?`/api/coach/agent?${s.opportunity_id?"opportunityId="+s.opportunity_id:""}`:`/api/coach/agent?sessionId=${s.id}`;
 useEffect(()=>{setOutreach(null);},[opportunityId]);
 useEffect(()=>{if(owner&&!loading){writeContinuation(ackStore(),owner,{sessionId:session?.id??null,draft:continuationDraft(message,pending,pendingProactive)});}},[owner,loading,session?.id,message,pending,pendingProactive,ackStore]);
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
  fetch("/api/coach/agent/sessions?all=1",{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then(async b=>{
   if(token!==generation.current)return;
   if(!b.ok)throw Error(b.error||"无法找回学习记录");
   setOwner(b.userId);setSessions(b.sessions);const continuation=readContinuation(ackStore(),b.userId,b.sessions.map((s:Session)=>s.id));const active=continuation?b.sessions.find((s:Session)=>s.id===continuation.sessionId):b.sessions.find((s:Session)=>s.status==="active");
   if(continuation)setMessage(companionVisibleText(continuation.draft));
if(active){jumpToLatest.current=true;setSession(active);const r=await fetch(historyUrl(active),{cache:"no-store",signal:controller.signal});const h=await r.json();if(!h.ok)throw Error(h.error);if(token===generation.current){setTurns(h.turns);setResumeEntry(h.turns.length>0);}const saved=active.id.startsWith("legacy")?null:await restorePendingAnswer(active.id,[],controller.signal);if(token===generation.current&&saved){retry.current=saved;pendingTarget.current=saved.opportunityId??null;setMessage(companionVisibleText(saved.text));setPending(saved.text);}}
  }).catch(e=>{if(token===generation.current&&!controller.signal.aborted)setError(e.message||"网络异常，请刷新找回记录");}).finally(()=>{if(token===generation.current)setLoading(false);});
  return()=>{generation.current=token+1;controller.abort();};
 // A job switch changes the next turn's materials, never the selected conversation.
 },[enabled,setModelNotice,ackStore]);
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
  text=companionRetryText(text,retry.current?.text);
  if(lock.current||!text.trim()||!enabled||loading)return;
  // 上一轮被检测到升档且还没确认：先确认再继续，不做静默计费。
  if(confirmGate.current)return;
  if(owner&&!proactive)writeContinuation(ackStore(),owner,{sessionId:session?.id??null,draft:text});
  pendingTarget.current=retry.current?.text===text&&retry.current.opportunityId!==undefined?retry.current.opportunityId:opportunityId??null;
  lock.current=true;const token=generation.current;jumpToLatest.current=false;setBusy(true);setError("");setFailedLesson(null);setPending(text);setPendingProactive(proactive);setDraft("");setProgress("正在连接导师…");setMessage(m=>m.trim()===text.trim()?"":m);setSendSequence(n=>n+1);
  try{await withChatRequestDeadline(async signal=>{
   let selected=session;
   // Starting a separate lesson must not depend on a paid AI archive succeeding.
   // The earlier session remains accessible in learning history.
   if(newLesson||!selected||selected.status==="archived"){
    const r=await fetch("/api/coach/agent/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId,title:title||companionVisibleText(text).slice(0,80)}),signal});const b=await r.json();
    if(!b.ok)throw Error(b.error||"开课失败");if(token!==generation.current)return;
    selected=b.session;setSession(b.session);setSessions(s=>[b.session,...s]);setTurns([]);
   }
   const retrying=retry.current?.text===text&&retry.current.sessionId===selected!.id;
   const targetId=retrying&&retry.current?.opportunityId!==undefined?retry.current.opportunityId:opportunityId??null;
   const requestId=retrying?retry.current!.requestId:crypto.randomUUID();
   const effectiveMode=proactive?"coaching":retrying?retry.current!.interactionMode??interactionMode:interactionMode;
   retry.current={text,sessionId:selected!.id,requestId,opportunityId:targetId,interactionMode:effectiveMode};
   if(!proactive){setProgress("先保存你的回答…");await persistPendingAnswer(retry.current,signal);if(token!==generation.current)return;setProgress("回答已保存，正在连接导师…");}
   // 重试先查回原结果，不能让零余额的预检挡住免费恢复；新生成仍由服务端预扣。
   if(!retrying)await assertGenerationQuota("chat",(url,options)=>fetch(url,{...options,signal:chatRequestSignal(signal,options?.signal)}),{sessionId:selected!.id});if(token!==generation.current)return;
   const responseLatencyMs=answerReceivedAt.current===null?undefined:performance.now()-answerReceivedAt.current;
   const r=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/x-ndjson","x-idempotency-key":requestId},body:JSON.stringify({opportunityId:targetId,sessionId:selected!.id,message:text,requestId,modelMode,interactionMode:effectiveMode,proactive:proactive||undefined,pageContext:targetId===opportunityId?chatContext||undefined:undefined,responseLatencyMs}),signal});
   const b=await readChatResponse<Turn&{ok?:boolean;retryable?:boolean;error?:string;stageSuggestion?:OpportunityStage|null}>(r,value=>{if(token===generation.current)setDraft(value);},value=>{if(token===generation.current)setProgress(value);});
   if(token!==generation.current)return;
   if(!b.ok){
    // A confirmed failed attempt has a refunded/closed reservation. A new attempt
    // needs a fresh billing key; an unknown network outcome retains the old key.
    if(!proactive&&b.retryable!==false){retry.current={text,sessionId:selected!.id,requestId:crypto.randomUUID(),opportunityId:targetId,interactionMode:effectiveMode};await persistPendingAnswer(retry.current,signal);}
    throw Error(b.error||"回答暂时不可用");
   }
   clearPendingAnswer(pendingAnswerStore(),selected!.id);retry.current=null;
   window.dispatchEvent(new Event("yizhi-quota-changed"));
   // Failure to clean up must not turn a confirmed turn into a failed answer.
   void fetch("/api/coach/agent/pending",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:selected!.id,requestId})}).catch(()=>{});
   answerReceivedAt.current=performance.now();
   setDraft("");
   const binding = companionBinding(text);
   if (binding) window.dispatchEvent(new CustomEvent("yizhi-companion-updated", { detail: binding }));
   setTurns(t=>t.some(x=>x.id===b.id)?t:[...t,{id:b.id,question:text,answer:b.answer,opportunity_id:targetId,learning_trace:b.learning_trace}]);setPending("");setResumeEntry(false);
   if(b.stageSuggestion){stageTarget.current=targetId??undefined;setStageSuggestion(b.stageSuggestion);}
   const notice=modelTurnNotice({modelMode,trace:b.learning_trace});
   if(notice&&!isAcknowledged(ackStore(),notice))setModelNotice(notice);
  });}catch(e){if(token===generation.current){const binding=companionBinding(text);if(binding)window.dispatchEvent(new CustomEvent("yizhi-companion-updated",{detail:{...binding,failed:true}}));setError(e instanceof Error?e.message:"网络异常，请检查历史后重试");if(proactive)setFailedLesson({text,title});else setMessage(m=>m||companionVisibleText(text));}}
  finally{if(token===generation.current){setBusy(false);lock.current=false;}}
 },[enabled,loading,opportunityId,session,modelMode,interactionMode,chatContext,ackStore,setModelNotice,owner]);
 useEffect(()=>{if(startRequest&&startRequest.opportunityId===opportunityId&&!loading&&enabled&&!seen.current.has(startRequest.id)&&!lock.current&&!confirmGate.current){seen.current.add(startRequest.id);onStartConsumed?.(startRequest.id);input.current?.focus({preventScroll:true});void send(startRequest.prompt,false,startRequest.title,startRequest.proactive===true);}},[startRequest,loading,enabled,send,opportunityId,busy,onStartConsumed,modelNotice]);
 async function archive(){
  if(!session||lock.current||!turns.length)return false;lock.current=true;setBusy(true);setError("");const token=generation.current;
  try{const b=await archiveRemote(session.id);if(token!==generation.current)return false;const closed={...session,status:"archived" as const,summary:b.summary};setSession(closed);setSessions(s=>s.map(x=>x.id===closed.id?closed:x));onArchived?.();return true;}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"保存复盘失败，原对话仍保留");return false;}
  finally{if(token===generation.current){lock.current=false;setBusy(false);}}
 }
 async function selectSession(id:string){
  if(lock.current)return;if(!id){newConversation();return;}const target=sessions.find(s=>s.id===id);if(!target)return;
  const token=++generation.current;jumpToLatest.current=true;setLoading(true);setError("");setFailedLesson(null);setSession(target);setTurns([]);setMessage("");setDraft("");setPending("");setModelNotice(null);
  retry.current=null;
  try{const r=await fetch(historyUrl(target),{cache:"no-store"});const b=await r.json();if(token!==generation.current)return;if(!b.ok)throw Error(b.error);setTurns(b.turns);setResumeEntry(b.turns.length>0);const saved=id.startsWith("legacy")?null:await restorePendingAnswer(target.id);if(token===generation.current&&saved){retry.current=saved;pendingTarget.current=saved.opportunityId??null;setMessage(companionVisibleText(saved.text));setPending(saved.text);}}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"读取失败");}finally{if(token===generation.current)setLoading(false);}
 }
 function newConversation(){if(lock.current)return;setSession(null);retry.current=null;setTurns([]);setMessage("");setDraft("");setPending("");setError("");setFailedLesson(null);setModelNotice(null);setStageSuggestion(null);setResumeEntry(false);input.current?.focus({preventScroll:true});}
 return <section className={styles.panel} data-resume={resumeContext||undefined} aria-label="对话辅导">
  <header><strong className={styles.mentorIdentity}>导师</strong>
  <div className={styles.metadata}><p className={styles.context} title={label}>{label}</p>
  {!!sessions.length&&<details ref={historyBox} className={styles.historyDisclosure}><summary>历史对话</summary><label className={styles.history}>选择对话<SelectMenu className={styles.historyMenu} value={session?.id||""} disabled={busy||loading} onChange={v=>void selectSession(v)} ariaLabel="选择学习记录" placeholder="新的辅导" options={[{value:"",label:"新的辅导"},...sessions.map(s=>({value:s.id,label:`${s.status==="archived"?"已归档":"继续"} · ${s.title.slice(0,36)}`}))]} /></label></details>}
  </div><button ref={settingsTrigger} type="button" className={styles.settingsTrigger} aria-label="辅导设置" title="辅导设置" disabled={loading} aria-expanded={settingsOpen} aria-haspopup="dialog" aria-controls={settingsId} popoverTarget={settingsId} popoverTargetAction="toggle" onClick={event=>{event.preventDefault();toggleSettings();}}><DotsThree size={18} aria-hidden="true"/></button><div ref={settingsMenu} id={settingsId} popover="auto" className={styles.settingsPanel} role="dialog" aria-label="辅导设置选项" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();settingsMenu.current?.hidePopover();settingsTrigger.current?.focus();}}}>
   <label>导师模式<select aria-label="导师模式" value={interactionMode} disabled={busy||loading||!!pending} onChange={e=>setInteractionMode(e.target.value as "coaching"|"mock_interview")}><option value="coaching">教练辅导</option><option value="mock_interview">面试官 · 一次一题</option></select></label>
   <p>{quotaLabel}。发送会调用 AI，失败释放额度；保存回答和笔记免费。</p><p>具体模型按输出参考价从高到低排列；单位为 ¥ / 百万 tokens，实际以账单为准。价格参考 TokenDance，读取于 {(modelAccess?.catalog??catalogWithAvailability([])).map(m=>m.referencePrice?.asOf.slice(0,10)).filter(Boolean).sort()[0]||'未记录'}。选择不会自动发送。</p>{!modelAccess&&<p>具体模型列表暂未读到，自动与实惠档仍可选。</p>}
  </div><button type="button" aria-label="新辅导" title="新开对话，原记录保留在学习记录中" disabled={busy||loading} onClick={newConversation}><Plus size={18}/></button></header>
  {resumeWorkflow&&<div className={styles.workflowSwitch}><button type="button" aria-pressed={guidedOpen} onClick={()=>setResumeGuided(true)}>简历修改</button><button type="button" aria-pressed={!guidedOpen} onClick={()=>setResumeGuided(false)}>其他辅导</button></div>}
  {guidedOpen&&<div className={styles.guidedWorkflow}>
    <ResumeComposerModel.Provider value={{mode:modelMode,control:<ModelPicker
      value={modelMode} onChange={setModelMode} catalog={modelCatalog}
      connected={modelAccess?.connected??false} disabled={busy||loading||!enabled}
    />}}>{resumeWorkflow?.content}</ResumeComposerModel.Provider>
  </div>}
  <div style={{display:guidedOpen?"none":"contents"}}>
  {resumeEntry&&!pending&&<div className={styles.returnEntry}><span>上次聊到：{companionVisibleText(turns.at(-1)?.question||"").slice(0,60)}</span><button type="button" onClick={()=>{setResumeEntry(false);if(!message)setMessage("接着上次继续，先帮我确认下一步。");input.current?.focus({preventScroll:true});}}>接着做</button></div>}
  <TaskRunTray enabled={enabled}/>
  <div ref={list} className={styles.messages} role="log" aria-label="辅导对话" aria-live="polite">
  {activeInvitation&&!message.trim()&&!busy&&!dismissedInvitations.includes(activeInvitation.id)&&<section className={styles.teachingInvite} aria-label="导师的练习邀请"><p>{activeInvitation.text}</p><div><button disabled={!enabled||busy||loading} onClick={()=>{setDismissedInvitations(ids=>[...ids,activeInvitation.id]);void send(activeInvitation.prompt,false,activeInvitation.title,true);}}>好，带我练这题</button><button onClick={()=>setDismissedInvitations(ids=>[...ids,activeInvitation.id])}>稍后</button></div>{!enabled&&<small>预览邀请；登录后可开始真实带练。</small>}</section>}
   {loading?<p>正在找回学习记录…</p>:!turns.length&&!pending&&(!invitation||dismissedInvitations.includes(invitation.id))?<div className={styles.welcome}><BookOpen size={26}/><h3>{resumeContext?"把经历写清楚，也写出分量。":"我们从这里开始"}</h3><p>{opening?.text||"告诉我你正在准备什么，我会带你完成下一步。"}</p><div className={styles.quickStarts}>{opening?.prompts.map(prompt=><button key={prompt} type="button" disabled={!enabled||busy} onClick={()=>void send(prompt)}>{prompt}</button>)}</div>{!enabled&&<p>当前为预览；登录后可以开始真实辅导。</p>}</div>:turns.map((t,index)=><div key={t.id} ref={index===turns.length-1?lastTurn:null}>{t.learning_trace?.proactive?<p className={styles.proactiveNote}>导师主动来问你了</p>:<><p className={styles.turnScope}>{t.opportunity_id===opportunityId?label:t.opportunity_id?jobLabels[t.opportunity_id]||"原岗位已移除":"通用辅导"}</p><p className={styles.question}>{companionVisibleText(t.question)}</p></>}<div className={styles.answer}><TutorMarkdown>{t.answer}</TutorMarkdown>{(()=>{const note=turnIntervention(insufficiencyFromTrace(t.learning_trace));return note?<p className={styles.interventionNote}>{note.text}</p>:null;})()}<button type="button" aria-label="复制导师回答" onClick={()=>void navigator.clipboard.writeText(t.answer).catch(()=>setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button>
   {t.learning_trace?.outcome&&<details className={styles.summary}><summary>查看本次练习成果</summary><OutcomeCard outcome={t.learning_trace.outcome} note={t.learning_trace.outcomeNote??null} turnId={t.id} opportunityId={t.opportunity_id??undefined} disabled={!enabled}/></details>}
   {!t.learning_trace?.outcome&&<MentorDeliverable turnId={t.id} question={t.question} answer={t.answer} opportunityId={t.opportunity_id} disabled={!enabled}/>}
   {!t.learning_trace?.outcome&&t.learning_trace?.outcomeNote&&<p className={styles.interventionNote}>{t.learning_trace.outcomeNote}</p>}
   {t.learning_trace?.model&&<details className={styles.usage}><summary>回复详情</summary><p>使用模型：{t.learning_trace.modelUsage?.model||t.learning_trace.model}</p>{t.learning_trace.modelUsage&&<p>输入 {t.learning_trace.modelUsage.inputTokens} / 输出 {t.learning_trace.modelUsage.outputTokens} tokens。用量不等于费用。</p>}<a href="https://tokendance.space/models" target="_blank" rel="noreferrer">查看 TokenPay 价格</a></details>}
   {index===turns.length-1&&!busy&&!loading&&session?.status!=="archived"&&!!t.learning_trace?.suggestions?.length&&<div className={styles.quickStarts} aria-label="继续这个问题">{t.learning_trace.suggestions.filter(q=>!/^(你|您|说说|谈谈|试着|请你|请您)/.test(q.trim())).slice(0,2).map(q=><button key={q} type="button" disabled={!enabled} onClick={()=>void send(q)}>{q}</button>)}</div>}
   {t.learning_trace?.outcome&&<button type="button" disabled={!enabled||savingNote!==null||savedNotes.has(t.id)} onClick={()=>void saveNote(t)}><BookOpen size={14}/>{savedNotes.has(t.id)?"已加入我的笔记":savingNote===t.id?"正在保存…":"保存完整回答"}</button>}
   </div></div>)}
   {pending&&!pendingProactive&&<><p className={styles.turnScope}>{pendingTarget.current?jobLabels[pendingTarget.current]||"原岗位已移除":"通用辅导"}</p><p className={styles.question}>{companionVisibleText(pending)}</p></>}
   {pending&&<div ref={incoming} className={styles.answer} style={{minHeight:readingHeight}}>{draft&&<TutorMarkdown streaming={busy}>{draft}</TutorMarkdown>}{busy?<p className={styles.streamStatus} role="status">{progress||"正在连接导师…"}</p>:<><p role="status">导师反馈尚未确认保存，原回答已恢复到输入框。</p><button type="button" disabled={loading||!enabled} onClick={()=>void send(message.trim()||pending)}>继续这次回答</button></>}</div>}
   {busy&&!pending&&<p role="status">导师正在整理进展…</p>}
   {stageSuggestion&&!busy&&<div className={styles.stageConfirm} role="group" aria-label="确认岗位状态"><span>{`听起来你已经「${STAGE_STATUS_WORDS[stageSuggestion]||stageSuggestion}」了——只有你点头、且云端保存成功我才改岗位状态：`}</span><button type="button" disabled={savingStage} onClick={async()=>{setSavingStage(true);try{if(await onStageAdvanced?.(stageSuggestion,stageTarget.current)!==false)setStageSuggestion(null);}finally{setSavingStage(false);}}}>{savingStage?"正在保存…":"更新状态"}</button><button type="button" disabled={savingStage} onClick={()=>setStageSuggestion(null)}>先不</button></div>}
   {session&&!session.id.startsWith("legacy")&&turns.length>0&&<details className={styles.summary}><summary>{session.summary?"已保存的对话总结":"整理与归档"}</summary>{session.summary&&<TutorMarkdown>{session.summary}</TutorMarkdown>}
    {session.status==="active"&&<><p>原对话始终保留；归档会生成总结，下次可以从历史记录打开。</p><button disabled={busy} onClick={()=>void archive()}>生成总结并归档 · {quotaLabel}</button></>}</details>}
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {failedLesson&&<button type="button" disabled={busy||loading} onClick={()=>void send(failedLesson.text,false,failedLesson.title,true)}>重新开始这题辅导</button>}
  {modelNotice&&<div className={styles.modelConfirm} role="group" aria-label="模型档位说明"><span>{modelNotice.text}</span><button type="button" onClick={()=>{rememberAcknowledged(ackStore(),modelNotice);setModelNotice(null);}}>{modelNotice.requiresConfirm?"知道了，继续":"知道了"}</button>{modelNotice.requiresConfirm&&modelMode!=="fast"&&<button type="button" onClick={()=>{rememberAcknowledged(ackStore(),modelNotice);setModelMode("fast");setModelNotice(null);}}>换回实惠档</button>}</div>}
  <form className={styles.composer} data-tour="composer" onSubmit={e=>{e.preventDefault();void send(message.trim());}}>
   <textarea ref={input} aria-label="给导师的消息" placeholder="写下你的回答，或直接说没听懂…" rows={2} maxLength={4000} disabled={!enabled} value={message} onChange={e=>{setMessage(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,112)+"px";}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(message.trim());}}}/>
   <footer><ModelPicker value={modelMode} onChange={setModelMode} catalog={modelCatalog} connected={modelAccess?.connected??false} disabled={busy||loading||!enabled}/><VoiceControls key={session?.id||"new"} value={message} onChange={setMessage} disabled={!enabled||busy||loading}/><button aria-label="发送消息" disabled={busy||loading||!enabled||!message.trim()||!!(modelNotice&&modelNotice.requiresConfirm)} type="submit"><ArrowUp size={18}/></button></footer>
  </form>
  <p className={styles.disclaimer}>AI 也会出错，重要信息请核实。</p>
 </div>
 </section>;
}
