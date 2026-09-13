"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowUp,Copy,Plus,BookOpen} from "@phosphor-icons/react";
import styles from "./AgentConversation.module.css";
import {parseMarkdownBold} from "@/lib/markdown-utils";
type Turn={id:string;question:string;answer:string};
type Session={id:string;title:string;status:"active"|"archived";summary?:string};
export type CoachingStart={id:string;title:string;prompt:string;opportunityId?:string};
const quickStarts=[
 {title:"带我练一遍",prompt:"请结合当前材料选一个最需要练的点。先给我一个短示范，再出一道我现在就能回答的练习，一次只问一题。"},
 {title:"我没有相关经历",prompt:"我可能没有相关经历。先帮我区分材料没写清和确实没做过，再教我做一个可以验证的小练习，不要编造成工作经历。"},
 {title:"换个例子解释",prompt:"请换一个更容易理解的小例子解释刚才的方法，然后让我试一次。"},
];
async function archiveRemote(sessionId:string){
 const r=await fetch("/api/coach/agent/archive",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({sessionId})});
 const b=await r.json();if(!b.ok)throw Error(b.error||"保存进展失败");return b;
}
export default function AgentConversation({opportunityId,label,enabled=true,startRequest,onStartConsumed,onArchived}:{opportunityId?:string;label:string;enabled?:boolean;startRequest?:CoachingStart|null;onStartConsumed?:(id:string)=>void;onArchived?:()=>void}){
 const [turns,setTurns]=useState<Turn[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sessions,setSessions]=useState<Session[]>([]),[session,setSession]=useState<Session|null>(null);
 const [pending,setPending]=useState("");
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
   const r=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":requestId},body:JSON.stringify({opportunityId,sessionId:selected!.id,message:text,requestId})});
   const b=await r.json().catch(()=>({error:"服务暂时没有返回答案，请保留问题后重试"}));
   if(token!==generation.current)return;if(!b.ok)throw Error(b.error||"回答暂时不可用");
   retry.current=null;
   setTurns(t=>t.some(x=>x.id===b.id)?t:[...t,{id:b.id,question:text,answer:b.answer}]);setMessage(m=>m.trim()===text.trim()?"":m);
  }catch(e){if(token===generation.current){setError(e instanceof Error?e.message:"网络异常，请检查历史后重试");setMessage(m=>m||text);}}
  finally{if(token===generation.current){setBusy(false);setPending("");lock.current=false;}}
 },[enabled,loading,opportunityId,session,turns.length,onArchived]);
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
  <header><strong>一起练一练</strong><button type="button" disabled={busy||loading} onClick={async()=>{if(session?.status==="active"&&turns.length&&!(await archive()))return;setSession(null);setTurns([]);setMessage("");input.current?.focus();}}><Plus size={16}/>新辅导</button></header>
  <p className={styles.context}>{label}</p>
  {!!sessions.length&&<label className={styles.history}>学习记录<select aria-label="选择学习记录" value={session?.id||""} disabled={busy||loading} onChange={e=>void selectSession(e.target.value)}><option value="">新的辅导</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.status==="archived"?"已归档 · ":"继续 · "}{s.title.slice(0,36)}</option>)}</select></label>}
  <div ref={list} className={styles.messages} role="log" aria-label="辅导对话" aria-live="polite">
   {loading?<p>正在找回学习记录…</p>:!turns.length&&!pending?<div className={styles.welcome}><BookOpen size={26}/><h3>不用想好问题再开口</h3><p>{enabled?"从左边选一个目标，或者让我先带你练一遍。你回答后，我会具体指出怎么改。":"登录并保存材料后可以开始真实辅导。"}</p></div>:turns.map(t=><div key={t.id}><p className={styles.question}>{t.question}</p><div className={styles.answer}><p>{parseMarkdownBold(t.answer)}</p><button type="button" aria-label="复制导师回答" onClick={()=>void navigator.clipboard.writeText(t.answer).catch(()=>setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button></div></div>)}
   {pending&&<p className={styles.question}>{pending}</p>}{busy&&<p role="status">{pending?"正在结合材料组织讲解…":"正在整理并保存这次学习…"}</p>}
   {session?.status==="archived"&&session.summary&&<details open className={styles.summary}><summary>本次学习笔记 · 下次可读取</summary><p>{session.summary}</p><small>AI 复盘，未验证的能力仍待验证。</small></details>}
  </div>
  <div className={styles.quickStarts} aria-label="辅导快捷问题">{quickStarts.slice(0,turns.length?3:2).map(q=><button key={q.title} type="button" disabled={!enabled||busy||loading} onClick={()=>void send(q.prompt,false,q.title)}>{q.title}</button>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <form onSubmit={e=>{e.preventDefault();void send(message.trim());}}>
   <textarea ref={input} aria-label="给导师的消息" placeholder="写下你的理解、回答，或直接说没听懂…" rows={3} maxLength={4000} disabled={!enabled} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(message.trim());}}}/>
   <footer><small>Enter 发送 · Shift+Enter 换行</small><button aria-label="发送消息" disabled={busy||loading||!enabled||!message.trim()} type="submit"><ArrowUp size={18}/></button></footer>
  </form>
  <div className={styles.archive}><small>辅导与复盘使用 AI 对话额度</small><button type="button" disabled={busy||loading||!turns.length||session?.status!=="active"} onClick={()=>void archive()}>结束并保存进展</button></div>
  {enabled&&<a className={styles.memoryDownload} href={"/api/coach/agent/memory?"+scope} download>下载背景与学习档案</a>}
 </section>;
}
