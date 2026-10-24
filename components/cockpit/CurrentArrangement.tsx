"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideCompanion, shrinkStep, type CompanionTask } from "@/lib/coach-harness/companion-arrangement";
import { companionPrompt, type CompanionBinding } from "@/lib/coach-harness/companion-protocol";
import TutorMarkdown from "./TutorMarkdown";
import styles from "./CurrentArrangement.module.css";

const fixtureText = "做了几年其他工作，想转AI产品经理，不知从哪开始，要不要先学Python";
type Saved = { id: string; version: number; companion: CompanionTask };
type Action = "open" | "submit" | "start" | "stuck" | "skip" | "end" | "reopen";
const draftKey = (id: string) => `companion-draft:${id}`;

export default function CurrentArrangement({ fixture = false, opportunityId = null, initialText='',onOpened,
  onAskMentor, onOpenResume, onOpenInterview }: {
  fixture?: boolean;
  opportunityId?: string | null;
  initialText?:string;
  onOpened?:()=>void;
  onAskMentor?: (prompt: string, attemptId: string) => void;
  onOpenResume?: () => void;
  onOpenInterview?: () => void;
}) {
  const demo = decideCompanion(fixtureText);
  const [saved, setSaved] = useState<Saved | null>(fixture ? { id: "fixture", version: 1, companion: { goalKey: "fixture", goalTitle: demo.goalTitle, sourceText: fixtureText, weeklyHours: null, deadline: null, answer: demo.answer, question: demo.question, step: demo.step, stages: demo.stages, route: "arrange", action: "not_started", submissions: [] } } : null);
  const current = useRef(saved); current.current = saved;
  const [open, setOpen] = useState(fixture||Boolean(initialText));
  const [enabled, setEnabled] = useState(fixture);
  const [loading, setLoading] = useState(!fixture);
  const [text, setText] = useState(initialText||(fixture ? fixtureText : ""));
  const [draft, setDraft] = useState("");
  const [stuck, setStuck] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const lock = useRef(false);
  const [adjusting, setAdjusting] = useState(Boolean(initialText));
  const [newGoal, setNewGoal] = useState(Boolean(initialText));
  const [earlier, setEarlier] = useState<{ id: string; goalTitle: string }[]>([]);
  const pending = useRef<{ id: string; text: string } | null>(null);
  const opening = useRef<{ id: string; text: string } | null>(null);
  const scopeGeneration = useRef(0);
  const task = saved?.companion;

  const read = useCallback(async (id?: string, recover = false) => {
    if (fixture) return;
    const token = scopeGeneration.current;
    const query = new URLSearchParams();
    if (id) query.set("planId", id);
    if (opportunityId) query.set("opportunityId", opportunityId);
    const response = await fetch(`/api/coach/companion?${query}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.ok) throw Error(body.error || "安排暂时没有读回，原记录仍保留");
    if (token !== scopeGeneration.current) return;
    setEnabled(Boolean(body.enabled)); setEarlier(body.earlier || []);
    let plan = body.plan as Saved | null;
    if (recover && plan) {
      const recovered = await fetch("/api/coach/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recover", planId: plan.id, opportunityId }) });
      const result = await recovered.json();
      if (!recovered.ok || !result.ok) throw Error(result.error || "回复保留在对话里，安排尚未恢复");
      plan = { id: result.planId, version: result.version, companion: result.companion };
    }
    if (token !== scopeGeneration.current) return;
    const changedPlan = plan?.id !== current.current?.id;
    setSaved(plan); current.current = plan; setError("");
    if (plan) {
      setOpen(true);
      if (changedPlan) try {
        const value = JSON.parse(sessionStorage.getItem(draftKey(plan.id)) || "null");
        setDraft(typeof value?.text === "string" ? value.text : "");
        pending.current = value?.pending || null;
      } catch { setDraft(""); pending.current = null; }
    }
  }, [fixture, opportunityId]);

  useEffect(() => {
    const token = ++scopeGeneration.current;
    if (fixture) return;
    setSaved(null); current.current = null; setDraft(""); pending.current = null; setLoading(true); setError("");
    let active = true;
    void read().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; scopeGeneration.current = token + 1; };
  }, [fixture, read]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const binding = (event as CustomEvent<CompanionBinding & { failed?: boolean }>).detail;
      if (binding?.planId !== current.current?.id) return;
      setReviewing(false);
      if (binding.failed) { setStatus("内容已保存，导师反馈还没完成。原消息和草稿仍保留。"); return; }
      void fetch(`/api/coach/companion?planId=${binding.planId}`, { cache: "no-store" }).then(r => r.json()).then(body => {
        if (body.ok && current.current && body.plan?.id === current.current.id && body.plan.version >= current.current.version) {
          setSaved(body.plan); current.current = body.plan; setStatus("回复已保留；安排已重新读取");
        }
      }).catch(() => setError("回复已保留；可以重新读取安排，不需要重发消息"));
    };
    window.addEventListener("yizhi-companion-updated", refresh);
    return () => window.removeEventListener("yizhi-companion-updated", refresh);
  }, []);

  useEffect(() => {
    if (!fixture && saved) void fetch("/api/coach/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "presented", planId: saved.id, expectedVersion: saved.version, opportunityId }) }).catch(() => undefined);
  }, [fixture, saved, opportunityId]);

  function keepDraft(value: string) {
    setDraft(value);
    if (current.current) try { sessionStorage.setItem(draftKey(current.current.id), JSON.stringify({ text: value, pending: pending.current })); } catch { /* Input remains usable. */ }
  }

  async function send(action: Action) {
    if (lock.current) return;
    const origin = current.current;
    const token = scopeGeneration.current;
    if (fixture) {
      if (!origin) return;
      const decision = decideCompanion(text, origin.companion);
      const c = origin.companion;
      setSaved({ ...origin, version: origin.version + 1, companion: action === "open" ? { ...c, ...decision } : { ...c, action: action === "submit" ? "submitted" : action === "start" || action === "reopen" ? "in_progress" : action === "stuck" ? "paused" : action === "skip" ? "skipped" : "ended", step: action === "stuck" && c.step ? shrinkStep(c.step, stuck) : c.step, submissions: action === "submit" ? [...c.submissions, { id: crypto.randomUUID(), text: draft, savedAt: new Date().toISOString(), feedback: null, review: "none" }] : c.submissions } });
      setStatus(action === "submit" ? "内容已保存，反馈还没完成（预览不调用模型）" : "预览状态已更新");
      return;
    }
    lock.current = true; setBusy(true); setError(""); setStatus("正在保存…");
    const submittedText = draft;
    if (action === "open" && (!origin || newGoal) && opening.current?.text !== text) opening.current = { id: crypto.randomUUID(), text };
    if (action === "submit" && pending.current?.text !== submittedText) pending.current = { id: crypto.randomUUID(), text: submittedText };
    if (action === "submit") keepDraft(submittedText);
    try {
      const response = await fetch("/api/coach/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, text: action === "submit" ? submittedText : action === "stuck" ? stuck : action === "open" ? text : undefined, planId: newGoal && action === "open" ? undefined : origin?.id, expectedVersion: newGoal && action === "open" ? undefined : origin?.version, creationId: action === "open" && (!origin || newGoal) ? opening.current?.id : undefined, newGoal, submissionId: pending.current?.id, opportunityId }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw Error(body.error || "没有确认保存，原输入还在");
      if (token !== scopeGeneration.current) return;
      const id = body.planId || body.saved?.id;
      const version = body.version || body.saved?.version;
      const next = body.companion && id ? { id, version, companion: body.companion } as Saved : null;
      if (next) {
        if (next.id !== origin?.id) { setDraft(""); pending.current = null; setReviewing(false); }
        setSaved(next); current.current = next;
        if(action==='open')onOpened?.();
      }
      const route = body.decision?.route;
      if (route === "resume") onOpenResume?.();
      if (route === "interview") onOpenInterview?.();
      if (route === "discuss") onAskMentor?.(text, crypto.randomUUID());
      if (action === "submit" && next) {
        const submissionId = pending.current!.id; pending.current = null;
        setDraft(value => { if (value === submittedText) { try { sessionStorage.removeItem(draftKey(next.id)); } catch {} return ""; } return value; });
        setStatus("内容已保存，正在请导师看"); setReviewing(true);
        onAskMentor?.(companionPrompt({ planId: id, version, submissionId }, submittedText), crypto.randomUUID());
      } else if (action === "open" && next && route !== "end") {
        setStatus("问题已保存，导师正在梳理"); setReviewing(true);
        onAskMentor?.(companionPrompt({ planId: id, version, submissionId: null }, text), crypto.randomUUID());
      } else setStatus(body.decision?.answer || "已保存");
      setAdjusting(false); setNewGoal(false);
      if (action === "open") opening.current = null;
    } catch (e) {
      if (token === scopeGeneration.current) { setError(e instanceof Error ? e.message : "没有确认保存，原输入还在"); setStatus(""); }
    } finally { lock.current = false; setBusy(false); }
  }

  async function restore(id?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await read(id || current.current?.id, true); setStatus("已重新读取安排，没有重新调用模型"); }
    catch (e) { setError(e instanceof Error ? e.message : "暂时无法读取，原记录还在"); }
    finally { lock.current = false; setBusy(false); }
  }

  async function continueMentor(submissionId: string | null) {
    if (lock.current || !current.current) return;
    lock.current = true; setBusy(true); setError("");
    const origin = current.current;
    try {
      const response = await fetch("/api/coach/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recover", planId: origin.id, opportunityId }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw Error(body.error || "回复状态未核对，暂不重复生成");
      if (current.current?.id !== origin.id) return;
      const next: Saved = { id: body.planId, version: body.version, companion: body.companion };
      setSaved(next); current.current = next;
      const submission = next.companion.submissions.find(item => item.id === submissionId);
      if (submissionId ? submission?.feedback : next.companion.mentorFeedback) { setStatus("已找回原反馈，没有重新生成"); return; }
      const original = submissionId ? submission?.text : next.companion.sourceText;
      if (original) { setReviewing(true); onAskMentor?.(companionPrompt({ planId: next.id, version: next.version, submissionId }, original), crypto.randomUUID()); }
    } catch (e) { setError(e instanceof Error ? e.message : "暂时无法继续，原内容还在"); }
    finally { lock.current = false; setBusy(false); }
  }

  if (loading) return <p role="status">正在找回安排…</p>;
  if (!fixture && !enabled && !task && !error) return null;
  if (!open && !task && !error) return <button type="button" className={styles.textButton} onClick={() => setOpen(true)}>想一起梳理接下来怎么做</button>;
  return <section className={styles.arrangement} aria-label="当前安排" aria-busy={busy}>
    {fixture && <p className={styles.note}>测试数据，不调用模型、不写云端。</p>}
    {!enabled && task && <p className={styles.note}>新的陪伴入口暂未开放，已保存记录仍可查看。</p>}
    {enabled && (!task || adjusting) && <div className={styles.form}>
      <label>你现在最想解决哪件事？<textarea value={text} maxLength={3000} aria-label="你现在最想解决哪件事" onChange={e => setText(e.target.value)} placeholder="想转行，不知道从哪开始" /></label>
      <button type="button" className={styles.primary} disabled={busy || !text.trim()} onClick={() => void send("open")}>{adjusting ? "按这个继续讨论" : "从这句话开始"}</button>
    </div>}
    {task && !newGoal && <>
      <header><h2>{task.goalTitle}</h2><p className={styles.note}>{task.weeklyHours || "投入时间待了解"}{task.deadline ? ` · ${task.deadline}` : ""}</p></header>
      {task.mentorFeedback ? <TutorMarkdown>{task.mentorFeedback}</TutorMarkdown> : <p>{task.answer} {fixture ? "" : "这是起点，具体安排等导师结合你的输入梳理。"}</p>}
      {task.reviewNote && <p className={styles.note}>{task.reviewNote}</p>}
      {!fixture && enabled && !task.mentorFeedback && <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void continueMentor(null)}>继续请导师梳理</button>}
      {task.step && <div className={styles.step}>
        <h3>{task.step.title}</h3><p>{task.step.why}</p>
        <dl><div><dt>交什么</dt><dd>{task.step.deliverable}</dd></div><div><dt>看什么</dt><dd>{task.step.check}</dd></div>{task.step.effort && <div><dt>建议投入</dt><dd>{task.step.effort}</dd></div>}</dl>
      </div>}
      {task.question && <p>{task.question}</p>}
      {enabled && task.action !== "ended" && <div className={styles.form}>
        <label>交给导师看<textarea value={draft} maxLength={3000} aria-label="交给导师看" onChange={e => keepDraft(e.target.value)} placeholder="贴上做出的内容，也可以说说卡住的地方" /></label>
        <button type="button" className={styles.primary} disabled={busy || reviewing || !draft.trim()} onClick={() => void send("submit")}>{reviewing ? "导师正在看这次内容…" : "提交给导师看"}</button>
      </div>}
      <details><summary>调整这一步</summary><div className={styles.actions}>
        {enabled && <>
          <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void send("start")}>从这一步开始</button>
          <button type="button" className={styles.textButton} disabled={busy} onClick={() => { setText(task.sourceText); setNewGoal(false); setAdjusting(value => !value); }}>调整理解</button>
          <button type="button" className={styles.textButton} disabled={busy} onClick={() => { setText(""); setNewGoal(true); setAdjusting(true); }}>换个目标，保留旧记录</button>
          <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void send("skip")}>已经做过</button>
          <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void send(task.action === "ended" ? "reopen" : "end")}>{task.action === "ended" ? "回到这一步" : "这次先到这里"}</button>
          <label>哪里卡住了？<textarea value={stuck} maxLength={1000} aria-label="哪里卡住了" onChange={e => setStuck(e.target.value)} placeholder={task.step?.stuck || "写一句目前的困难"} /></label>
          <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void send("stuck")}>先把这步缩小</button>
        </>}
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => void restore()}>重新读取安排与已存反馈</button>
      </div></details>
      {earlier.length > 0 && <details><summary>原来的目标</summary>{earlier.map(item => <button key={item.id} type="button" className={styles.textButton} disabled={busy} onClick={() => void restore(item.id)}>{item.goalTitle}</button>)}</details>}
      {task.stages.length > 0 && <details><summary>后续路线</summary>{task.stages.map(stage => <p key={stage.title}>{stage.title} · {stage.note}</p>)}</details>}
      {task.submissions.length > 0 && <details open><summary>提交和导师反馈（{task.submissions.length}）</summary>{task.submissions.map(item => <article key={item.id} className={styles.submission}>
        <p className={styles.userText}>{item.text}</p>
        {item.savedAt && <p className={styles.note}>{new Date(item.savedAt).toLocaleString("zh-CN")}</p>}
        {item.feedback ? <TutorMarkdown>{item.feedback}</TutorMarkdown> : <>
          <p className={styles.note}>内容已保存，反馈还没完成。</p>
          {!fixture && <button type="button" className={styles.textButton} disabled={busy} onClick={() => void restore()}>找回已存反馈（不重新生成）</button>}
          {!fixture && enabled && <button type="button" className={styles.textButton} disabled={busy || reviewing} onClick={() => void continueMentor(item.id)}>继续请导师看</button>}
        </>}
        {item.reviewNote && <p className={styles.note}>{item.reviewNote}</p>}
      </article>)}</details>}
      {(task.action === "paused" || task.action === "skipped") && <p className={styles.note}>{task.action === "paused" ? `这步先停在卡住。${task.stuckNote || ""}` : "已经做过了，可以交已有内容。"}暂停和跳过都不算已经掌握。</p>}
    </>}
    {status && <p className={styles.note} role="status">{status}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className={styles.textButton} disabled={busy} onClick={() => void restore()}>重新读取，保留原记录</button></div>}
  </section>;
}
