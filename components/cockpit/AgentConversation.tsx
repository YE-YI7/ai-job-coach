"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowUp,Copy,Plus,BookOpen} from "@phosphor-icons/react";
import styles from "./AgentConversation.module.css";
import {parseMarkdownBold} from "@/lib/markdown-utils";
import {type ChatMode,CHAT_MODELS} from "@/lib/coach-harness/chat-options";
type Turn={id:string;question:string;answer:string;learning_trace?:{suggestions?:string[];model?:string;modelUsage?:{model:string;inputTokens:number;outputTokens:number;averageTokensPerSecond:number|null}}};
type Session={id:string;title:string;status:"active"|"archived";summary?:string};
export type CoachingStart={id:string;title:string;prompt:string;opportunityId?:string};
async function archiveRemote(sessionId:string){
 const r=await fetch("/api/coach/agent/archive",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({sessionId})});
 const b=await r.json();if(!b.ok)throw Error(b.error||"保存进展失败");return b;
}
export default function AgentConversation({opportunityId,label,enabled=true,startRequest,onStartConsumed,onArchived}:{opportunityId?:string;label:string;enabled?:boolean;startRequest?:CoachingStart|null;onStartConsumed?:(id:string)=>void;onArchived?:()=>void}){
 const [turns,setTurns]=useState<Turn[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sessions,setSessions]=useState<Session[]>([]),[session,setSession]=useState<Session|null>(null);
 const [pending,setPending]=useState("");
 const [modelMode,setModelMode]=useState<ChatMode>("auto");
 const [modelAccess,setModelAccess]=useState<{connected:boolean;available:string[]}|null>(null);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch("/api/coach/agent/models",{signal:controller.signal,cache:"no-store"}).then(r=>r.json()).then(b=>{if(b.ok)setModelAccess(b);}).catch(()=>{});return()=>controller.abort();},[enabled]);
 const generation=useRef(0),lock=useRef(false),seen=useRef("");
 const retry=useRef<{text:string;sessionId:string;requestId:string}|null>(null);
 const list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const scope=opportunityId?"opportunityId="+opportunityId:"";
 useEffect(()=>{
  const token=++generation.current;lock.current=false;
  setTurns([]);setMessage("");setError("");setPending("");setBusy(false);setSession(null);setSessions([]);setLoading(true);
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
 useEffect(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;},[turns,pending,busy]);
 const send=useCallback(async(text:string,newLesson=false,title?:string)=>{
  if(lock.current||!text.trim()||!enabled||loading)return;
  lock.current=true;const token=generation.current;setBusy(true);setError("");setPending(text);
  try{
   let selected=session;
   if(newLesson&&selected?.status==="active"&&turns.length){
    const archived=await archiveRemote(selected.id);if(token!==generation.current)return;
    const closed={...selected,status:"archived" as const,summary:archived.summary};setSession(closed);setSessions(s=>s.map(x=>x.id===closed.id?closed:x));selected=closed;onArchived?.();
   }
   if(newLesson||!selected||selected.status==="archived"){
    const r=await fetch("/api/coach/agent/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunityId,title:title||text.slice(0,80)})});const b=await r.json();
    if(!b.ok)throw Error(b.error||"开课失败");if(token!==generation.current)return;
    selected=b.session;setSession(b.session);setSessions(s=>[b.session,...s]);setTurns([]);
   }
   const requestId=retry.current?.text===text&&retry.current.sessionId===selected!.id?retry.current.requestId:crypto.randomUUID();
   retry.current={text,sessionId:selected!.id,requestId};
   const r=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":requestId},body:JSON.stringify({opportunityId,sessionId:selected!.id,message:text,requestId,modelMode})});
   const b=await r.json().catch(()=>({error:"服务暂时没有返回答案，请保留问题后重试"}));
   if(token!==generation.current)return;if(!b.ok)throw Error(b.error||"回答暂时不可用");
   retry.current=null;
   setTurns(t=>t.some(x=>x.id===b.id)?t:[...t,{id:b.id,question:text,answer:b.answer,learning_trace:b.learning_trace}]);setMessage(m=>m.trim()===text.trim()?"":m);
  }catch(e){if(token===generation.current){setError(e instanceof Error?e.message:"网络异常，请检查历史后重试");setMessage(m=>m||text);}}
  finally{if(token===generation.current){setBusy(false);setPending("");lock.current=false;}}
 },[enabled,loading,opportunityId,session,turns.length,onArchived,modelMode]);
 useEffect(()=>{if(startRequest&&startRequest.opportunityId===opportunityId&&!loading&&enabled&&startRequest.id!==seen.current&&!lock.current){seen.current=startRequest.id;onStartConsumed?.(startRequest.id);input.current?.scrollIntoView({block:"nearest"});input.current?.focus();void send(startRequest.prompt,true,startRequest.title);}},[startRequest,loading,enabled,send,opportunityId,busy,onStartConsumed]);
 async function archive(){
  if(!session||lock.current||!turns.length)return false;lock.current=true;setBusy(true);setError("");const token=generation.current;
  try{const b=await archiveRemote(session.id);if(token!==generation.current)return false;const closed={...session,status:"archived" as const,summary:b.summary};setSession(closed);setSessions(s=>s.map(x=>x.id===closed.id?closed:x));onArchived?.();return true;}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"保存复盘失败，原对话仍保留");return false;}
  finally{if(token===generation.current){lock.current=false;setBusy(false);}}
 }
 async function selectSession(id:string){
  if(lock.current)return;const target=sessions.find(s=>s.id===id);if(!target)return;
  const token=++generation.current;setLoading(true);setError("");setSession(target);setTurns([]);setMessage("");
  try{const r=await fetch("/api/coach/agent?"+scope+(id==="legacy"?"":"&sessionId="+id),{cache:"no-store"});const b=await r.json();if(token!==generation.current)return;if(!b.ok)throw Error(b.error);setTurns(b.turns);}
  catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"读取失败");}finally{if(token===generation.current)setLoading(false);}
 }
 return <section className={styles.panel} aria-label="对话辅导">
  <header><strong>一起练一练</strong><button type="button" title="开始新辅导；已有对话会先生成学习摘要（一次 AI 调用）" disabled={busy||loading} onClick={async()=>{if(session?.status==="active"&&turns.length&&!(await archive()))return;setSession(null);setTurns([]);setMessage("");input.current?.focus();}}><Plus size={16}/>新辅导</button></header>
  <p className={styles.context}>{label}</p>
  {!!sessions.length&&<label className={styles.history}>学习记录<select aria-label="选择学习记录" value={session?.id||""} disabled={busy||loading} onChange={e=>void selectSession(e.target.value)}><option value="">新的辅导</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.status==="archived"?"已归档 · ":"继续 · "}{s.title.slice(0,36)}</option>)}</select></label>}
  <div ref={list} className={styles.messages} role="log" aria-label="辅导对话" aria-live="polite">
   {loading?<p>正在找回学习记录…</p>:!turns.length&&!pending?<div className={styles.welcome}><BookOpen size={26}/><h3>不用想好问题再开口</h3><p>{enabled?"从左边选一个目标，或直接说现在卡在哪里。":"登录后可以开始真实辅导。"}</p></div>:turns.map((t,index)=><div key={t.id}><p className={styles.question}>{t.question}</p><div className={styles.answer}><p>{parseMarkdownBold(t.answer)}</p><button type="button" aria-label="复制导师回答" onClick={()=>void navigator.clipboard.writeText(t.answer).catch(()=>setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button>
   {t.learning_trace?.model&&<details className={styles.usage}><summary>{t.learning_trace.modelUsage?.model||t.learning_trace.model}{t.learning_trace.modelUsage?` · ${t.learning_trace.modelUsage.inputTokens+t.learning_trace.modelUsage.outputTokens} tokens${t.learning_trace.modelUsage.averageTokensPerSecond!==null?` · ${t.learning_trace.modelUsage.averageTokensPerSecond} tokens/s`:""}`:" · 用量未返回"}</summary>{t.learning_trace.modelUsage&&<p>输入 {t.learning_trace.modelUsage.inputTokens} / 输出 {t.learning_trace.modelUsage.outputTokens} tokens。速率是输出 tokens ÷ 请求耗时，包含等待，不是扣费倍率。</p>}<a href="https://tokendance.space/models" target="_blank" rel="noreferrer">TokenPay 实时价格（以账单为准）</a></details>}
   {index===turns.length-1&&!busy&&!loading&&session?.status!=="archived"&&!!t.learning_trace?.suggestions?.length&&<div className={styles.quickStarts} aria-label="继续这个问题">{t.learning_trace.suggestions.slice(0,2).map(q=><button key={q} type="button" disabled={!enabled} onClick={()=>void send(q)}>{q}</button>)}</div>}
   </div></div>)}
   {pending&&<p className={styles.question}>{pending}</p>}{busy&&<p role="status">{pending?"正在结合材料组织讲解…":"正在整理并保存这次学习…"}</p>}
   {session?.status==="archived"&&session.summary&&<details open className={styles.summary}><summary>本次学习笔记 · 下次可读取</summary><p>{session.summary}</p><small>AI 复盘，未验证的能力仍待验证。</small></details>}
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <form onSubmit={e=>{e.preventDefault();void send(message.trim());}}>
   <textarea ref={input} aria-label="给导师的消息" placeholder="写下你的理解、回答，或直接说没听懂…" rows={3} maxLength={4000} disabled={!enabled} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(message.trim());}}}/>
   <footer><select className={styles.modelSelect} aria-label="选择导师模型" title="自动模式按问题从已接入优选池选择；未连接TokenPay使用托管Flash，单价以供应商为准" value={modelMode} disabled={busy||loading||!enabled} onChange={e=>setModelMode(e.target.value as ChatMode)}><option value="auto">{modelAccess?.connected?"自动 · 优选模型":"自动 · 托管 Flash"}</option><option value="fast">经济 · DeepSeek V4 Flash</option>{CHAT_MODELS.map(id=><option key={id} value={id} disabled={!modelAccess?.available.includes(id)}>{id}</option>)}</select><button aria-label="发送消息" disabled={busy||loading||!enabled||!message.trim()} type="submit"><ArrowUp size={18}/></button></footer>
  </form>
 </section>;
}
