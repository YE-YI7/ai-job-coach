"use client";
import { useState } from "react";
import type { ResumeRecovery as Recovery } from "@/lib/coach-harness/resume-recovery";
import styles from "./ResumeRecovery.module.css";

export default function ResumeRecovery({ recovery, onSave, onKeep, onRetry, busy }: { recovery: Recovery; onSave: (answer: string) => Promise<void>; onKeep: () => void; onRetry: () => void; busy: boolean }) {
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <form className={styles.recovery} onSubmit={async event => {
    event.preventDefault();
    if (!answer.trim() || saving || busy) return;
    setSaving(true); setError("");
    try { await onSave(answer); setAnswer(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，补充仍在，请重试"); }
    finally { setSaving(false); }
  }}>
    <div className={styles.heading}><strong>{recovery.detailSaved ? "补充已保存" : "补一个细节，继续改"}</strong><span>原文保留 · 本次未扣额度</span></div>
    {recovery.sourceExcerpt && <blockquote>{recovery.sourceExcerpt}</blockquote>}
    {recovery.detailSaved ? <><p>{recovery.question}</p><div className={styles.actions}><button type="button" disabled={busy} onClick={onKeep}>保留当前内容</button><button type="button" disabled={busy} onClick={onRetry}>再试一次（AI 额度）</button></div></> : <><label htmlFor="resume-factual-detail">{recovery.question}</label>
    <textarea id="resume-factual-detail" value={answer} onChange={event => setAnswer(event.target.value)} maxLength={2000} rows={3} placeholder="只写你实际做过的内容，不用凑数字。" disabled={saving || busy}/>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}><span>补充会保存到本岗位简历，不会自动采用 AI 改写。</span><button type="submit" disabled={!answer.trim() || saving || busy}>{saving ? "保存并继续…" : "保存补充并继续改"}</button></div></>}
  </form>;
}
