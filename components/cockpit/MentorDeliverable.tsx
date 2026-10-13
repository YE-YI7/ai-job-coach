"use client";
import {useEffect,useState} from "react";
import styles from "./OutcomeCard.module.css";
import {noteRecoveryMessage} from './note-recovery';
type Saved={id:string;summary:string;outcome?:unknown};
/** A mentor draft is a note, never evidence of the user's experience or mastery. */
export default function MentorDeliverable({turnId,question,answer,opportunityId,disabled=false}:{turnId:string;question:string;answer:string;opportunityId?:string|null;disabled?:boolean}){
 const [open,setOpen]=useState(false),[text,setText]=useState(answer.slice(0,6000)),[saved,setSaved]=useState<Saved|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(!open)return;const controller=new AbortController();setBusy(true);
  fetch(`/api/coach/agent/outcomes?turnId=${encodeURIComponent(turnId)}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"读取成果失败");if(b.saved){setSaved(b.saved);setText(b.saved.summary||"");}}).catch(e=>{if(!controller.signal.aborted)setError(noteRecoveryMessage(e,'read'));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();
 },[open,turnId]);
 async function save(){if(busy||!text.trim())return;setBusy(true);setError("");try{
  const r=await fetch("/api/coach/agent/sessions",{method:saved?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(saved?{sessionId:saved.id,summary:text,expectedSummary:saved.summary}:{note:true,title:question.slice(0,120)||"对话成果",summary:text,sourceTurnId:turnId,opportunityId:opportunityId??null})});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"成果未保存，草稿仍保留");
  const next=saved?{...saved,summary:b.summary}:b.session;setSaved(next);setText(next.summary);window.dispatchEvent(new Event("yizhi-notes-changed"));
 }catch(e){setError(noteRecoveryMessage(e,'save'));}finally{setBusy(false);}}
 return open?<section className={styles.card} aria-label="对话成果"><header><h4>把这次对话留下来</h4><span className={styles.state}>导师建议 · 待核实</span></header><label className={styles.answer}><span className={styles.caption}>整理成你下次能用的版本</span><textarea aria-label="编辑对话成果" maxLength={6000} value={text} disabled={disabled||busy} onChange={e=>setText(e.target.value)}/></label><footer><button type="button" className={styles.primary} disabled={disabled||busy||!text.trim()||saved?.summary===text} onClick={()=>void save()}>{busy?"正在确认…":saved?.summary===text?"已保存到我的笔记":error?'保存失败，重试':saved?"保存修改":"保存到我的笔记"}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>收起</button></footer>{error&&<p role="alert" className={styles.error}>{error}</p>}<p className={styles.free}>保存免费，保留原对话和岗位来源；不会写入简历事实。</p></section>:<button type="button" disabled={disabled} onClick={()=>setOpen(true)}>编辑并保存成果</button>;
}
