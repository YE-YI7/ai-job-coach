"use client";
import {useEffect,useRef,useState} from "react";
import {Check,Copy,PencilLine} from "@phosphor-icons/react";
import styles from "./OutcomeCard.module.css";
import TutorMarkdown from "./TutorMarkdown";
import {reviseOutcome,type LearningOutcome} from "@/lib/coach-harness/learning-outcome";

/**
 * 成果卡正文：给人读的可读文本，走既有笔记接口存成 summary。
 * JSON 一律不进 summary——那列是给用户读的，成果的结构化字段仍留在台账里。
 */
export function outcomeNoteText(outcome: LearningOutcome, note: string | null): string {
  const observed = [`本题表现：${outcome.observedStatus}（只看这一题，不是永久能力认证）`,
    outcome.openIssue ? `还没解决：${outcome.openIssue}` : "",
    outcome.nextStep ? `下一步：${outcome.nextStep}` : ""].filter(Boolean).join("\n");
  return [`本次目标：${outcome.goal}`, `我的答案：\n${outcome.answerDraft}`, observed, note ? `说明：${note}` : ""]
    .filter(Boolean).join("\n\n");
}

const STATE_WORD = {draft: "草稿", saving: "正在保存…", saved: "已保存", failed: "保存失败"} as const;

export default function OutcomeCard({outcome, note, turnId, disabled = false}: {
  outcome: LearningOutcome;
  note?: string | null;
  /** 回查锚点：成果存进笔记时挂在这一轮上。 */
  turnId: string;
  opportunityId?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(outcome.answerDraft);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<{sessionId: string; summary: string; title: string; version:number} | null>(null);
  const [base,setBase]=useState(outcome);
  const [loading,setLoading]=useState(true);
  const [readFailed,setReadFailed]=useState(false);
  const [reload,setReload]=useState(0);
  const request=useRef<{id:string;answer:string;version:number}|null>(null);
  const dirty=useRef(false);
  const [state, setState] = useState<keyof typeof STATE_WORD>("draft");
  const [error, setError] = useState("");
  // 用户手写修改是新的内容版本，但不自动升级为新的能力证据：表现档一个字不动。
  const shown = draft === base.answerDraft ? base : reviseOutcome(base, draft);
  const text = outcomeNoteText(shown, note ?? null);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setReadFailed(false);setError("");
    fetch(`/api/coach/agent/outcomes?turnId=${encodeURIComponent(turnId)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||"成果读取失败");return body;})
      .then(body=>{
        if(body.saved){
          setSaved({sessionId:body.saved.id,summary:body.saved.summary,title:body.saved.title,version:body.saved.version});
          setBase(body.saved.outcome);setDraft(current=>dirty.current?current:body.saved.outcome.answerDraft);setState(dirty.current?"draft":"saved");request.current=null;
        }
      }).catch(error=>{if(!controller.signal.aborted){setReadFailed(true);setError(error instanceof Error?error.message:"成果读取失败");}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[turnId,reload]);

  async function saveToNotes() {
    if (state === "saving" || loading || readFailed) return;
    setState("saving"); setError("");
    try {
      const version=saved?.version??0;
      if(!request.current || request.current.answer!==draft || request.current.version!==version)
        request.current={id:crypto.randomUUID(),answer:draft,version};
      const body={turnId,answerDraft:draft,expectedVersion:version,requestId:request.current.id};
      const r = await fetch("/api/coach/agent/outcomes", {method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      const b = await r.json();
      if (!r.ok || !b.ok) {if(r.status===409)setReadFailed(true);throw Error(b.error || "笔记没有保存成功，你的草稿仍在，可以直接重试。");}
      setSaved({sessionId:b.saved.id,summary:b.saved.summary,title:b.saved.title,version:b.saved.version});
      setBase(b.saved.outcome);setDraft(b.saved.outcome.answerDraft);request.current=null;dirty.current=false;
      setState("saved");
    } catch (e) {
      setState("failed"); setError(e instanceof Error ? e.message : "笔记没有保存成功，草稿仍在。");
    }
  }

  return <section className={styles.card} aria-label="本次成果卡">
    <header>
      <h4>这次练完留下什么</h4>
      <span className={styles.state} role="status">{loading ? "正在读取…" : STATE_WORD[state]}</span>
    </header>
    <p className={styles.goal}>本次目标 · {shown.goal}</p>
    <div className={styles.answer}>
      <p className={styles.caption}>我的答案{shown.revision > outcome.revision && <small>（内容版本 {shown.revision}：你改过，本题表现不变）</small>}</p>
      {editing
        ? <textarea aria-label="编辑我的答案" value={draft} maxLength={6000} disabled={disabled||loading||state==="saving"} onChange={e => {dirty.current=true;setDraft(e.target.value);setState("draft");}} />
        : <TutorMarkdown>{draft}</TutorMarkdown>}
    </div>
    <p className={styles.observed}>本题表现 · {shown.observedStatus}<span>只看这一题，不是永久能力认证。</span></p>
    {shown.openIssue && <p className={styles.line}>还没解决 · {shown.openIssue}</p>}
    {shown.nextStep && <p className={styles.line}>下一步 · {shown.nextStep}</p>}
    {note && <p className={styles.caveat}>{note}</p>}
    <footer>
      <button type="button" disabled={disabled||loading||readFailed||state==="saving"} onClick={() => setEditing(e => !e)}>{editing ? <><Check size={14}/>改完了</> : <><PencilLine size={14}/>编辑</>}</button>
      <button type="button" className={styles.primary} disabled={disabled || loading || readFailed || state === "saving" || !draft.trim()} onClick={() => void saveToNotes()}>
        {state === "saving" ? "正在保存…" : state === "failed" ? "保存失败，重试" : saved ? "更新我的笔记" : "保存到我的笔记"}
      </button>
      <button type="button" disabled={disabled} onClick={() => void navigator.clipboard.writeText(text).catch(() => setError("复制失败，请选中文字复制"))}><Copy size={14}/>复制</button>
    </footer>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {readFailed && <button type="button" onClick={()=>setReload(n=>n+1)}>重新读取已保存成果</button>}
    {saved && <p className={styles.recall}>已存进「我的笔记」，标题「{saved.title}」· 记录编号 <code>{saved.sessionId}</code></p>}
    <p className={styles.free}>保存与复制不消耗 AI 额度，也不会结束这次对话。</p>
  </section>;
}
