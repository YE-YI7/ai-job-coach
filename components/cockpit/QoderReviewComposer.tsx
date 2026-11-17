"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Upload } from "lucide-react";
import VoiceControls from "./VoiceControls";
import { appendReviewMaterial, readReviewTextMaterial } from "./review-text-material";
import styles from "./QoderInterviewWorkspace.module.css";

/** Local intake/focus only. The parent owns notes, rounds, saving and billing. */
export default function QoderReviewComposer({ notes, onChange, voiceDisabled, roundPicker, children, roundLabel = "一面" }: {
  notes: string;
  onChange: (value: string) => void;
  voiceDisabled: boolean;
  roundPicker: ReactNode;
  children: ReactNode;
  roundLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latestNotes = useRef(notes);
  const readVersion = useRef(0);
  const showEditor = editing || Boolean(notes);
  useEffect(() => { latestNotes.current = notes; }, [notes]);
  useEffect(() => () => { readVersion.current += 1; }, []);
  useEffect(() => {
    if (editing) editor.current?.focus({ preventScroll: true });
  }, [editing]);
  async function readFile(file?: File) {
    if (!file) return;
    const version = ++readVersion.current;
    setReading(true);
    setFileError("");
    setFileMessage("");
    try {
      const text = await readReviewTextMaterial(file);
      if (version !== readVersion.current) return;
      onChange(appendReviewMaterial(latestNotes.current, text));
      setEditing(true);
      setFileMessage(`已读入 ${file.name} · 确认后再保存`);
    } catch (error) {
      if (version !== readVersion.current) return;
      setFileError(error instanceof Error ? error.message : "文件没有读入，已有记录保留，请重试或粘贴。");
    } finally {
      if (version === readVersion.current) {
        setReading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  }
  return <div className={styles.capture} data-qoder-surface="capture" data-editing={showEditor}>
    <div className={styles.heroCopy}>
      <p className={styles.eyebrow}>DEBRIEF · 真实面试复盘</p>
      <h2 className={styles.heroTitle}>面完当天，<em>趁还记得。</em></h2>
      <p className={styles.lead}>把你记得的问题、回答和追问留下来。</p>
    </div>
    <div className={styles.materialEntry}>
      <button type="button" className={styles.materialPick} disabled={reading || voiceDisabled}
        aria-label="选择文字材料" aria-busy={reading} onClick={() => fileInput.current?.click()}>
        <Upload size={25} strokeWidth={1.4} aria-hidden="true" />
        <strong>{reading ? "正在读入…" : showEditor ? "再加一份材料" : "选一份材料"}</strong>
        {!showEditor && <small>转写稿 / 面经</small>}
      </button>
      <input hidden ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown"
        aria-label="面试文字材料文件" disabled={reading || voiceDisabled}
        onChange={event => void readFile(event.target.files?.[0])} />
      {!showEditor && <p className={styles.fine}>TXT / Markdown · 仅在本机读取</p>}
      {fileMessage && <p className={styles.fine} role="status">{fileMessage}</p>}
      {fileError && <p className={styles.error} role="alert">{fileError}</p>}
    </div>
    {!showEditor && <p className={styles.pasteLink}>也可以<button type="button"
      onClick={() => setEditing(true)}>直接粘贴或打字<ArrowRight size={14} aria-hidden="true" /></button></p>}
    <div className={styles.captureVoice} data-qoder-part="capture-voice">
      <VoiceControls showLabel value={notes} onChange={onChange} disabled={voiceDisabled} readText={notes} />
    </div>
    <details className={styles.reviewRound}>
      <summary>{roundLabel} · 调整面试轮次</summary>
      {roundPicker}
    </details>
    {showEditor && <section className={styles.reviewWriting}>
      <label htmlFor="review-notes">面试记录</label>
      <textarea ref={editor} id="review-notes" aria-label="面试记录" value={notes} rows={6}
        onChange={event => onChange(event.target.value)}
        placeholder="写下或口述你记得的问题和回答：被追问了什么、哪题最没底、对方给了什么反馈…" />
      <p className={styles.fine}>原文先留下，结论和导师一起回看。确认后才提交。</p>
    </section>}
    <div className={styles.captureActions} data-interview-part="review-actions" hidden={!showEditor}>
      {children}
    </div>
  </div>;
}
