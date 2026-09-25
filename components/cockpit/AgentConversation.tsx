"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowUp,Copy,Plus,BookOpen} from "@phosphor-icons/react";
import styles from "./AgentConversation.module.css";
import TutorMarkdown from "./TutorMarkdown";
import VoiceControls from "./VoiceControls";
import ModelPicker from "./ModelPicker";
import SelectMenu from "@/components/ui/SelectMenu";
import {type ChatMode} from "@/lib/coach-harness/chat-options";
import {catalogWithAvailability,type CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import {readChatResponse} from "@/lib/coach-harness/chat-stream";
import {STAGE_STATUS_WORDS} from "@/lib/opportunities/timeline";
import type {OpportunityStage} from "@/lib/opportunities/types";
type Turn={id:string;question:string;answer:string;learning_trace?:{suggestions?:string[];model?:string;proactive?:boolean;modelUsage?:{model:string;inputTokens:number;outputTokens:number;averageTokensPerSecond:number|null}}};
type Session={id:string;title:string;status:"active"|"archived";summary?:string};
export type CoachingStart={id:string;title:string;prompt:string;opportunityId?:string;proactive?:boolean};
async function archiveRemote(sessionId:string){
 const r=await fetch("/api/coach/agent/archive",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({sessionId})});
 const b=await r.json();if(!b.ok)throw Error(b.error||"保存进展失败");return b;
}
export default function AgentConversation({opportunityId,label,enabled=true,startRequest,onStartConsumed,onArchived,onStageAdvanced,chatContext,opening}:{opportunityId?:string;label:string;enabled?:boolean;startRequest?:CoachingStart|null;onStartConsumed?:(id:string)=>void;onArchived?:()=>void;onStageAdvanced?:(stage:OpportunityStage)=>void|Promise<boolean>;chatContext?:string;opening?:{text:string;prompts:string[]}}){
 const [turns,setTurns]=useState<Turn[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sessions,setSessions]=useState<Session[]>([]),[session,setSession]=useState<Session|null>(null);
 const [pending,setPending]=useState("");
 const [pendingProactive,setPendingProactive]=useState(false);
 const [draft,setDraft]=useState("");
 const [progress,setProgress]=useState("");
 const [stageSuggestion,setStageSuggestion]=useState<OpportunityStage|null>(null);
 const [savingStage,setSavingStage]=useState(false);
 const [modelMode,setModelModeState]=useState<ChatMode>(()=>{try{return (localStorage.getItem("yi-zhi.chat-model") as ChatMode)||"auto";}catch{return "auto";}});
 const setModelMode=useCallback((mode:ChatMode)=>{setModelModeState(mode);try{localStorage.setItem("yi-zhi.chat-model",mode);}catch{}},[]);
 const [modelAccess,setModelAccess]=useState<{connected:boolean;available:string[];catalog:CatalogEntryAvailability[]}|null>(null);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch("/api/coach/agent/models",{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then(b=>{if(!b.ok)return;const available:string[]=Array.isArray(b.available)?b.available:[];const catalog=Array.isArray(b.catalog)&&b.catalog.length?b.catalog as CatalogEntryAvailability[]:catalogWithAvailability(available);setModelAccess({connected:!!b.connected,available,catalog});}).catch(()=>{});return()=>controller.abort();},[enabled]);
 const generation=useRef(0),lock=useRef(false),seen=useRef("");
 const retry=useRef<{text:string;sessionId:string;requestId:string}|null>(null);
 const list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const scope=opportunityId?"opportunityId="+opportunityId:"";
 useEffect(()=>{
  const token=++generation.current;lock.current=false;
  setTurns([]);setMessage("");setError("");setPending("");setPendingProactive(false);setDraft("");setStageSuggestion(null);setBusy(false);setSession(null);setSessions([]);setLoading(true);
  if(!enabled){setLoading(false);return;}
  const controller=new AbortController();
  fetch("/api/coach/agent/sessions?"+scope,{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then(async b=>{
   if(token!==generation.current)return;
   if(!b.ok)throw Error(b.error||"无法找回学习记录");
   setSessions(b.sessions);const active=b.sessions.find((s:Session)=>s.status==="active");
   if(active){setSession(active);const r=await fetch("/api/coach/agent?"+scope+"&sessionId="+active.id,{cache:"no-store",signal:controller.signal});const h=await r.json();if(!h.ok)throw Error(h.error);if(token===generation.current)setTurns(h.turns);}
  }).catch(e=>{if(token===generation.current&&!controller.signal.aborted)setError(e.message||"网络异常，请刷新找回记录");}).finally(()=>{if(token===generation.current)setLoading(false);});
  return()=>{generation.current=token+1;controller.abort();};
 },[scope,enabled]);
 useEffect(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;},[turns,pending,busy,draft]);
 const send=useCallback(async(text:string,newLesson=false,title?:string,proactive=false)=>{
  if(lock.current||!text.trim()||!enabled||loading)return;
  lock.current=true;const token=generation.current;setBusy(true);setError("");setPending(text);setPendingProactive(proactive);setDraft("");setProgress("正在连接导师…");
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
   retry.current={text,sessionId:selected!.id,requestId};
   const r=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/x-ndjson","x-idempotency-key":requestId},body:JSON.stringify({opportunityId,sessionId:selected!.id,message:text,requestId,modelMode,proactive:proactive||undefined,pageContext:chatContext?chatContext.slice(0,1200):undefined})});
   const b=await readChatResponse<Turn&{ok?:boolean;error?:string;stageSuggestion?:OpportunityStage|null}>(r,value=>{if(token===generation.current)setDraft(value);},value=>{if(token===generation.current)setProgress(value);});
   if(token!==generation.current)return;if(!b.ok)throw Error(b.error||"回答暂时不可用");
   retry.current=null;
   setDraft("");
   setTurns(t=>t.some(x=>x.id===b.id)?t:[...t,{id:b.id,question:text,answer:b.answer,learning_trace:b.learning_trace}]);setMessage(m=>m.trim()===text.trim()?"":m);
   if(b.stageSuggestion)setStageSuggestion(b.stageSuggestion);
  }catch(e){if(token===generation.current){setError(e instanceof Error?e.message:"网络异常，请检查历史后重试");setMessage(m=>m||text);}}
  finally{if(token===generation.current){setBusy(false);setPending("");setPendingProactive(false);lock.current=false;}}
 },[enabled,loading,opportunityId,session,modelMode,chatContext]);
 useEffect(()=>{if(startRequest&&startRequest.opportunityId===opportunityId&&!loading&&enabled&&startRequest.id!==seen.current&&!lock.current){seen.current=startRequest.id;onStartConsumed?.(startRequest.id);input.current?.scrollIntoView({block:"nearest"});input.current?.focus();void send(startRequest.prompt,true,startRequest.title,startRequest.proactive===true);}},[startRequest,loading,enabled,send,opportunityId,busy,onStartConsumed]);
 async function archive(){
  if(!session||lock.current||!turns.length)return false;lock.current=true;setBusy(true);setError("");const token=generation.current;
  try{const b=await archiveRemote(session.id);if(token!==generation.current)return false;const closed={...session,status:"archived" as const,summary:b.summary};setSession(closed);setSessions(s=>s.map(x=>x.id===closed.id?closed:x));onArchived?.();return true;}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"保存复盘失败，原对话仍保留");return false;}
  finally{if(token===generation.current){lock.current=false;setBusy(false);}}
 }
 async function selectSession(id:string){
  if(lock.current)return;const target=sessions.find(s=>s.id===id);if(!target)return;
  const token=++generation.current;setLoading(true);setError("");setSession(target);setTurns([]);setMessage("");setDraft("");
  try{const r=await fetch("/api/coach/agent?"+scope+(id==="legacy"?"":"&sessionId="+id),{cache:"no-store"});const b=await r.json();if(token!==generation.current)return;if(!b.ok)throw Error(b.error);setTurns(b.turns);}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"读取失败");}finally{if(token===generation.current)setLoading(false);}
 }
 return <section className={styles.panel} aria-label="对话辅导">
  <header><strong>AI 求职导师</strong><button type="button" title="新开对话，原记录保留在学习记录中" disabled={busy||loading} onClick={()=>{setSession(null);setTurns([]);setMessage("");setDraft("");setError("");input.current?.focus();}}><Plus size={16}/>新辅导</button></header>
  <p className={styles.context}>{label}</p>
  {!!sessions.length&&<label className={styles.history}>学习记录<SelectMenu className={styles.historyMenu} value={session?.id||""} disabled={busy||loading} onChange={v=>void selectSession(v)} ariaLabel="选择学习记录" placeholder="新的辅导" options={[{value:"",label:"新的辅导"},...sessions.map(s=>({value:s.id,label:`${s.status==="archived"?"已归档":"继续"} · ${s.title.slice(0,36)}`}))]} /></label>}
  <div ref={list} className={styles.messages} role="log" aria-label="辅导对话" aria-live="polite">
   {loading?<p>正在找回学习记录…</p>:!turns.length&&!pending?<div className={styles.welcome}><BookOpen size={26}/><h3>我们从这里开始</h3><p>{opening?.text||"告诉我你正在准备什么，我会带你完成下一步。"}</p><div className={styles.quickStarts}>{opening?.prompts.map(prompt=><button key={prompt} type="button" disabled={!enabled||busy} onClick={()=>void send(prompt)}>{prompt}</button>)}</div>{!enabled&&<p>当前为预览；登录后可以开始真实辅导。</p>}</div>:turns.map((t,index)=><div key={t.id}>{t.learning_trace?.proactive?<p className={styles.proactiveNote}>导师主动来问你了</p>:<p className={styles.question}>{t.question}</p>}<div className={styles.answer}><TutorMarkdown>{t.answer}</TutorMarkdown><button type="button" aria-label="复制导师回答" onClick={()=>void navigator.clipboard.writeText(t.answer).catch(()=>setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button>
   {t.learning_trace?.model&&<details className={styles.usage}><summary>{t.learning_trace.modelUsage?.model||t.learning_trace.model}{t.learning_trace.modelUsage?` · ${t.learning_trace.modelUsage.inputTokens+t.learning_trace.modelUsage.outputTokens} tokens${t.learning_trace.modelUsage.averageTokensPerSecond!==null?` · ${t.learning_trace.modelUsage.averageTokensPerSecond} tokens/s`:""}`:" · 用量未返回"}</summary>{t.learning_trace.modelUsage&&<p>输入 {t.learning_trace.modelUsage.inputTokens} / 输出 {t.learning_trace.modelUsage.outputTokens} tokens。速率是输出 tokens ÷ 请求耗时，包含等待，不是扣费倍率。</p>}<a href="https://tokendance.space/models" target="_blank" rel="noreferrer">TokenPay 实时价格（以账单为准）</a></details>}
   {index===turns.length-1&&!busy&&!loading&&session?.status!=="archived"&&!!t.learning_trace?.suggestions?.length&&<div className={styles.quickStarts} aria-label="继续这个问题">{t.learning_trace.suggestions.filter(q=>!/^(你|您|说说|谈谈|试着|请你|请您)/.test(q.trim())).slice(0,2).map(q=><button key={q} type="button" disabled={!enabled} onClick={()=>void send(q)}>{q}</button>)}</div>}
   </div></div>)}
   {pending&&!pendingProactive&&<p className={styles.question}>{pending}</p>}
   {draft&&<div className={styles.answer}><TutorMarkdown>{draft}</TutorMarkdown>{!busy&&<small>回答未完成，尚未确认保存</small>}</div>}
   {busy&&<p role="status">{pending?progress||"正在连接导师…":"导师正在整理进展…"}</p>}
   {stageSuggestion&&!busy&&<div className={styles.stageConfirm} role="group" aria-label="确认岗位状态"><span>{`听起来你已经「${STAGE_STATUS_WORDS[stageSuggestion]||stageSuggestion}」了——只有你点头、且云端保存成功我才改岗位状态：`}</span><button type="button" disabled={savingStage} onClick={async()=>{setSavingStage(true);try{if(await onStageAdvanced?.(stageSuggestion)!==false)setStageSuggestion(null);}finally{setSavingStage(false);}}}>{savingStage?"正在保存…":"更新状态"}</button><button type="button" disabled={savingStage} onClick={()=>setStageSuggestion(null)}>先不</button></div>}
   {session&&session.id!=="legacy"&&(session.summary||(session.status==="active"&&turns.length>0))&&<details className={styles.summary}><summary>本轮收获</summary>{session.summary?<TutorMarkdown>{session.summary}</TutorMarkdown>:<p>对话里值得下次带走的收获、难点和练习，整理后会存在这里。</p>}
    {session.status==="active"&&turns.length>0&&<button disabled={busy} onClick={()=>void archive()}>整理本次进展（AI 额度）</button>}</details>}
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <form onSubmit={e=>{e.preventDefault();void send(message.trim());}}>
   <textarea ref={input} aria-label="给导师的消息" placeholder="写下你的理解、回答，或直接说没听懂…" rows={3} maxLength={4000} disabled={!enabled} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(message.trim());}}}/>
   <footer><ModelPicker value={modelMode} onChange={setModelMode} catalog={modelAccess?.catalog??catalogWithAvailability([])} connected={modelAccess?.connected??false} disabled={busy||loading||!enabled}/><VoiceControls key={`${opportunityId||"general"}:${session?.id||"new"}`} value={message} onChange={setMessage} readText={turns.at(-1)?.answer} disabled={!enabled||busy||loading}/><button aria-label="发送消息" disabled={busy||loading||!enabled||!message.trim()} type="submit"><ArrowUp size={18}/></button></footer>
  </form>
  <p className={styles.disclaimer}>AI 也会犯错，请核实重要信息。</p>
 </section>;
}
