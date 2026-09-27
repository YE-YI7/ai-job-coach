"use client";
import {useEffect,useState} from "react";
import {BookOpen,Check,FileText,PenLine,Plus,Search,X} from "lucide-react";
import TutorMarkdown from "./TutorMarkdown";
import styles from "./MyNotes.module.css";
type Note={id:string;title:string;summary:string};
export default function MyNotes({onClose}:{onClose:()=>void}){
 const [notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState<Note|null>(null);
 const [title,setTitle]=useState(""),[text,setText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [query,setQuery]=useState(""),[preview,setPreview]=useState(false);
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
  <header className={styles.header}><div className={styles.identity}><BookOpen size={24}/><div><h2>我的笔记</h2><p>把有用的留下，慢慢变成自己的。</p></div></div><button type="button" aria-label="关闭我的笔记" disabled={busy} onClick={()=>{if(canLeave())onClose();}}><X size={20}/></button></header>
  <div className={styles.workspace}>
   <section className={styles.library} aria-label="笔记目录">
    <button className={styles.newButton} type="button" disabled={busy} onClick={()=>{if(!canLeave())return;setSelected(null);setTitle("");setText("");setError("");setPreview(false);}}><Plus size={17}/>写一条笔记</button>
    <label className={styles.search}><Search size={15}/><input aria-label="搜索笔记" placeholder="搜索笔记" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <p className={styles.listCaption}>最近笔记 <span>{notes.length}</span></p>
    {loading?<p role="status">正在找回笔记…</p>:<nav className={styles.list} aria-label="笔记列表">{notes.filter(n=>`${n.title} ${n.summary}`.toLowerCase().includes(query.toLowerCase())).map(n=><button key={n.id} type="button" disabled={busy} aria-pressed={n.id===selected?.id} onClick={()=>{if(!canLeave())return;setSelected(n);setTitle(n.title);setText(n.summary);setError("");setPreview(true);}}><FileText size={16}/><span><strong>{n.title}</strong><small>{n.summary.replace(/[#*`>]/g,"").slice(0,85)}</small></span></button>)}{!notes.length&&<div className={styles.empty}><BookOpen size={24}/><p>你的第一条笔记<br/>可以是一句突然想通的话。</p></div>}{!!notes.length&&!notes.some(n=>`${n.title} ${n.summary}`.toLowerCase().includes(query.toLowerCase()))&&<p>没有找到，换个词试试。</p>}</nav>}
    <p className={styles.libraryHint}>也可以在导师回答下<br/>点击「加入我的笔记」。</p>
   </section>
   <section className={styles.editor} aria-label="笔记正文">
    <div className={styles.editorBar}><span>{selected?"已收录的笔记":"新笔记"}</span><button type="button" aria-pressed={preview} onClick={()=>setPreview(!preview)}>{preview?<PenLine size={15}/>:<BookOpen size={15}/>} {preview?"编辑内容":"阅读预览"}</button></div>
    {selected?<h3 className={styles.noteTitle}>{title}</h3>:<input className={styles.titleInput} aria-label="笔记标题" placeholder="给这次收获起个名字" value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)}/>}
    {preview?<div className={styles.reading}>{text?<TutorMarkdown>{text}</TutorMarkdown>:<p>写下内容后，就能在这里看到排版。</p>}</div>:<textarea className={styles.writing} aria-label="笔记内容" placeholder="一个想明白的概念、一段值得留住的回答，或下次面试前想提醒自己的事…" value={text} maxLength={6000} disabled={busy} onChange={e=>setText(e.target.value)}/>}
    <footer className={styles.footer}><span>{text.length} / 6000 字 · {dirty?"未保存":selected?"已保存":"草稿"}</span><button className={styles.saveButton} type="button" disabled={busy||!text.trim()||!!selected&&!dirty} onClick={()=>void save()}>{busy?"保存中…":selected&&!dirty?<><Check size={16}/>已保存</>:"保存笔记"}</button></footer>
  {error&&<p role="alert">{error}</p>}
   <p className={styles.storageNote}>保存不消耗 AI 额度 · 展示最近 30 条</p>
   </section>
  </div>
 </aside>;
}
