"use client";
import {useEffect,useState} from "react";
import styles from "./MyNotes.module.css";
type Note={id:string;title:string;summary:string};
export default function MyNotes({onClose}:{onClose:()=>void}){
 const [notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState<Note|null>(null);
 const [title,setTitle]=useState(""),[text,setText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const dirty=text!==(selected?.summary||"")||(!selected&&!!title);
 const canLeave=()=>!dirty||window.confirm("这条笔记尚未保存，确定放弃修改吗？");
 useEffect(()=>{const c=new AbortController();fetch("/api/coach/agent/sessions?notes=1",{signal:c.signal,cache:"no-store"}).then(r=>r.json()).then(b=>{if(!b.ok)throw Error(b.error||"笔记读取失败");setNotes(b.sessions.filter((n:Note)=>n.summary));}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[]);
 async function save(){
  setBusy(true);setError("");
  try{const r=await fetch("/api/coach/agent/sessions",{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected?{sessionId:selected.id,summary:text,expectedSummary:selected.summary}:{note:true,title:title.trim()||"我的笔记",summary:text})});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"保存失败");
   const note:Note=selected?{...selected,summary:text}:b.session;setNotes(items=>selected?items.map(n=>n.id===selected.id?note:n):[note,...items]);setSelected(note);setTitle(note.title);setText(note.summary);
  }catch(e){setError(e instanceof Error?e.message:"保存失败，草稿仍保留");}finally{setBusy(false);}
 }
 return <aside className={styles.panel} aria-label="我的笔记" onKeyDown={e=>{if(e.key==="Escape"&&!busy&&canLeave())onClose();}}>
  <header><h2>我的笔记</h2><button type="button" disabled={busy} onClick={()=>{if(canLeave())onClose();}}>关闭</button></header>
  <p>自己记，或从导师回答一键收下。保存不消耗 AI 额度；这里显示最近 30 条笔记。</p>
  <button type="button" disabled={busy} onClick={()=>{if(!canLeave())return;setSelected(null);setTitle("");setText("");setError("");}}>＋ 新建笔记</button>
  {loading?<p role="status">正在读取…</p>:<nav aria-label="笔记列表">{notes.map(n=><button key={n.id} type="button" disabled={busy} aria-pressed={n.id===selected?.id} onClick={()=>{if(!canLeave())return;setSelected(n);setTitle(n.title);setText(n.summary);setError("");}}>{n.title}</button>)}{!notes.length&&<p>还没有笔记，从下面记下第一条。</p>}</nav>}
  <label>标题<input value={title} maxLength={200} disabled={!!selected||busy} onChange={e=>setTitle(e.target.value)}/></label>
  <label>内容<textarea value={text} rows={12} maxLength={6000} disabled={busy} onChange={e=>setText(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  {selected&&!dirty&&!error&&<p role="status">已保存</p>}
  <button type="button" disabled={busy||!text.trim()} onClick={()=>void save()}>{busy?"正在保存…":"保存笔记"}</button>
 </aside>;
}
