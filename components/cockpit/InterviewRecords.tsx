"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { interviewProgress, questionMatches, type InterviewHistorySession } from "@/lib/interview/history";
import TutorMarkdown from "./TutorMarkdown";
import { normalizeInterviewAssessment } from "./interview-assessment-logic";
import styles from "./InterviewRecords.module.css";

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const lower = text.toLocaleLowerCase(), search = needle.toLocaleLowerCase();
  const pieces = [];
  let from = 0, at = lower.indexOf(search);
  while (at !== -1) {
    pieces.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
    at = lower.indexOf(search, from);
  }
  pieces.push(text.slice(from));
  return <>{pieces}</>;
}

function SavedFeedback({ value }: { value: Record<string, unknown> }) {
  const assessment = normalizeInterviewAssessment(value);
  if (!assessment) return null;
  return <div><TutorMarkdown>{assessment.summary}</TutorMarkdown>
    <details><summary>当时的证据与重答路线</summary>
      {[{ label: "站得住的证据", values: assessment.evidence }, { label: "仍缺少的证据", values: assessment.missingEvidence },
        { label: "重答路线", values: assessment.rewritePlan }].filter(group => group.values.length).map(group => <section key={group.label}>
        <h4>{group.label}</h4><ul>{group.values.map((text, index) => <li key={index}><TutorMarkdown>{text}</TutorMarkdown></li>)}</ul>
      </section>)}
      {assessment.dimensions.map((dimension, index) => <p key={index}>{dimension.name}：{dimension.comment}</p>)}
      {!assessment.evidence.length && !assessment.missingEvidence.length && !assessment.rewritePlan.length
        && !assessment.dimensions.length && <p>旧反馈没有保存这些字段，不补造内容。</p>}
    </details>
  </div>;
}

export function InterviewResult({ session, query = "", onHistory, onResume }: {
  session: InterviewHistorySession; query?: string; onHistory?: () => void; onResume?: () => void;
}) {
  const [search, setSearch] = useState(query);
  const progress = interviewProgress(session);
  const visible = session.turns.filter(turn => questionMatches(turn, search));
  const next = session.turns.find(turn => !turn.attempts.length && !turn.skipped);
  return <section className={styles.result} aria-label="模拟面试结果">
    <header className={styles.resultHeader}>
      <div><p className={styles.meta}>{session.jobLabel ? `${session.jobLabel} · ` : ""}{session.round} · {session.roundType}</p>
        <h2>你答了 <strong>{progress.answered}</strong> 题。</h2>
        <p>先回看当时的原话，再决定下一步。作答进度不代表能力评分。</p></div>
      {onHistory && <button type="button" onClick={onHistory}>过往模拟面试 <ArrowRight size={16} /></button>}
    </header>
    <div className={styles.overview}>
      <section><h3>作答进度</h3><p className={styles.progressCount}>{progress.answered} / {session.turns.length} <span>题</span></p>
        <div className={styles.questionDots}>{session.turns.map((turn, index) => {
          const status = turn.attempts.length ? "answered" : turn.skipped ? "skipped" : turn.seenAt ? "unanswered" : "unseen";
          const label = { answered: "答了", skipped: "跳过", unanswered: "未回答", unseen: "未记录作答" }[status];
          return <a key={turn.questionId} href={`#interview-${session.id}-${turn.questionId}`} data-state={status}
            aria-label={`第${index + 1}题，${label}`}>{String(index + 1).padStart(2, "0")}<span>{label}</span></a>;
        })}</div>
        {progress.longest && <blockquote><p>你说得最长的一段 · {progress.longest.length} 字</p>
          <div>{progress.longest.answer}</div>
          <a href={`#interview-${session.id}-${progress.longest.questionId}`}>重看这题</a></blockquote>}
      </section>
      <dl className={styles.numbers}>
        <div><dt>回答</dt><dd>{progress.answered}<small>题</small></dd></div>
        <div><dt>实际追问</dt><dd>{progress.followups}<small>次</small></dd></div>
        <div><dt>经过时间（含暂停）</dt><dd>{progress.seconds === null ? <span className={styles.unavailable}>结束时间未记录</span>
          : `${String(Math.floor(progress.seconds / 60)).padStart(2, "0")}:${String(progress.seconds % 60).padStart(2, "0")}`}</dd></div>
        <div><dt>主动跳过</dt><dd>{progress.skipped}<small>题</small></dd></div>
        <div><dt>未回答 / 未记录作答</dt><dd>{progress.unanswered} / {progress.unseen}</dd></div>
      </dl>
    </div>
    <div className={styles.next}>
      <p>{session.status === "running" ? "这一场尚未结束，已保存的内容都在下面。"
        : next ? `这次先练到这里。还有 ${progress.unanswered + progress.unseen} 题没有留下回答。` : "这一场的原话已经收好，可以逐题回看。"}</p>
      {onResume && session.status === "running" && <button type="button" onClick={onResume}>接着练 <ArrowRight size={16} /></button>}
    </div>
    <header className={styles.transcriptHeader}><h3>逐题回看</h3><label><Search size={16} aria-hidden="true" />
      <input type="search" aria-label="搜索本轮问题与回答" placeholder="搜索问题或回答" value={search} maxLength={80}
        onChange={event => setSearch(event.target.value)} /></label><span>{visible.length} / {session.turns.length} 题</span></header>
    {!visible.length && <p role="status">没有找到这段原话，换个关键词试试。</p>}
    {visible.map(turn => <details className={styles.transcript} key={turn.questionId}
      id={`interview-${session.id}-${turn.questionId}`} open={Boolean(search)}>
      <summary><span>第 {session.turns.indexOf(turn) + 1} 题{turn.followsQuestionId ? " · 承接上一答" : ""}</span>
        <strong><Highlight text={turn.question} query={search} /></strong></summary>
      {!turn.attempts.length && <p>{turn.skipped ? "这题主动跳过，没有计为回答。" : turn.seenAt ? "这题还没有回答。" : "没有保存这题的作答记录。"}</p>}
      {turn.attempts.map((attempt, index) => <article key={attempt.id}>
        <p className={styles.meta}>第 {index + 1} 次回答{attempt.state === "pending" ? " · 回答已保存，反馈待完成" : ""}</p>
        <p className={styles.answer}><Highlight text={attempt.answer} query={search} /></p>
        {attempt.assessment && <SavedFeedback value={attempt.assessment} />}
        {typeof attempt.assessment?.followUp === "string" && attempt.assessment.followUp && <div className={styles.feedbackQuestion}>
          <span>当时反馈建议追问（不计入实际追问次数）</span><p><Highlight text={attempt.assessment.followUp} query={search} /></p>
        </div>}
      </article>)}
    </details>)}
  </section>;
}

export default function InterviewHistory({ opportunityId, onClose, onResume, demoSessions }: {
  opportunityId: string; onClose: () => void; onResume: (session: InterviewHistorySession) => void;
  demoSessions?: InterviewHistorySession[];
}) {
  const initial = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(initial.get("interviewQ") || "");
  const [search, setSearch] = useState(query);
  const [round, setRound] = useState(initial.get("interviewRound") || "");
  const [roundDraft, setRoundDraft] = useState(round);
  const [allJobs, setAllJobs] = useState(initial.get("interviewScope") === "all");
  const [page, setPage] = useState(Math.max(1, Number(initial.get("interviewPage")) || 1));
  const [selected, setSelected] = useState<string | null>(initial.get("interviewRecord"));
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([opportunityId, query, round, allJobs, page, retry]);
  const [loaded, setLoaded] = useState<{ key: string; sessions: InterviewHistorySession[]; total: number; error: string } | null>(null);
  const loading = loaded?.key !== requestKey;
  const sessions = loading ? [] : loaded.sessions;
  const total = loading ? 0 : loaded.total;
  const error = loading ? "" : loaded.error;
  useEffect(() => {
    const url = new URL(window.location.href);
    const values = { interviewHistory: "1", interviewQ: query, interviewRound: round,
      interviewScope: allJobs ? "all" : "", interviewPage: String(page), interviewRecord: selected || "" };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [query, round, allJobs, page, selected]);
  useEffect(() => {
    const controller = new AbortController();
    if (demoSessions) {
      const filtered = demoSessions.filter(session => (!round || session.round === round)
        && (!query || session.turns.some(turn => questionMatches(turn, query))));
      void Promise.resolve().then(() => {
        if (!controller.signal.aborted) setLoaded({ key: requestKey,
          sessions: filtered.slice((page - 1) * 10, page * 10), total: filtered.length, error: "" });
      });
      return () => controller.abort();
    }
    const params = new URLSearchParams({ page: String(page) });
    if (!allJobs) params.set("opportunityId", opportunityId);
    if (query) params.set("q", query);
    if (round) params.set("round", round);
    void fetch(`/api/interview/history?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || "历史记录未能读取");
      if (controller.signal.aborted) return;
      setLoaded({ key: requestKey, sessions: result.sessions, total: result.total, error: "" });
    }).catch(reason => {
      if (!controller.signal.aborted) setLoaded({ key: requestKey, sessions: [], total: 0, error: reason.message });
    });
    return () => controller.abort();
  }, [opportunityId, query, round, allJobs, page, demoSessions, requestKey]);
  return <section className={styles.history} aria-label="过往模拟面试">
    <header className={styles.resultHeader}><div><button type="button" onClick={onClose}><ArrowLeft size={16} />返回面试准备</button>
      <h2>过往模拟面试</h2><p>{demoSessions ? "虚构示例，仅演示界面，不是你的真实历史。" : "只显示当前账号的记录，旧回答按原文保留。"}</p></div></header>
    <form className={styles.filters} onSubmit={event => {
      event.preventDefault(); setQuery(search.trim()); setRound(roundDraft.trim()); setPage(1); setSelected(null);
    }}>
      <label>关键词<input type="search" value={search} maxLength={80} placeholder="搜问题、回答或追问"
        onChange={event => setSearch(event.target.value)} /></label>
      <label>轮次<input list="interview-history-round-options" value={roundDraft} maxLength={24} placeholder="全部轮次"
        onChange={event => setRoundDraft(event.target.value)} /><datalist id="interview-history-round-options">
        {["电话初筛", "一面", "二面", "三面", "终面", "HR面"].map(value => <option key={value} value={value} />)}
      </datalist></label>
      {!demoSessions && <label>岗位<select value={allJobs ? "all" : "current"}
        onChange={event => { setAllJobs(event.target.value === "all"); setPage(1); setSelected(null); }}>
        <option value="current">当前岗位</option><option value="all">全部岗位</option></select></label>}
      <button type="submit">搜索</button>
      {(query || round) && <button type="button" onClick={() => {
        setSearch(""); setQuery(""); setRound(""); setRoundDraft(""); setPage(1);
      }}>清空筛选</button>}
    </form>
    {loading ? <p role="status">正在读取历史记录…</p> : error ? <div role="alert"><p>{error}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)}>重新读取</button></div> : <>
      <p className={styles.meta}>{total} 场{query ? ` · “${query}”` : ""}</p>
      {!sessions.length && <p role="status">{query || round ? "没有匹配的记录，换个关键词或清空筛选。" : "还没有模拟面试记录。完成一次练习后，可以在这里回看。"}</p>}
      {sessions.map(session => {
        const progress = interviewProgress(session);
        return <article className={styles.historyRow} key={session.id}>
          <button type="button" className={styles.historyToggle} aria-expanded={selected === session.id}
            onClick={() => setSelected(value => value === session.id ? null : session.id)}>
            <span><strong>{session.round} · {session.roundType}</strong><small>{session.jobLabel ? `${session.jobLabel} · ` : ""}{new Date(session.createdAt).toLocaleString("zh-CN")}
              · {session.status === "completed" ? "已结束" : "尚未结束"}</small></span>
            <span>{progress.answered} / {session.turns.length} 题 <ArrowRight size={16} /></span>
          </button>
          {progress.longest && selected !== session.id && <p className={styles.excerpt}><Highlight text={progress.longest.answer} query={query} /></p>}
          {selected === session.id && <InterviewResult session={session} query={query} onResume={() => onResume(session)} />}
        </article>;
      })}
      {total > 10 && <nav className={styles.pagination} aria-label="历史记录分页">
        <button type="button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setSelected(null); }}>上一页</button>
        <span>{page} / {Math.ceil(total / 10)}</span>
        <button type="button" disabled={page * 10 >= total} onClick={() => { setPage(value => value + 1); setSelected(null); }}>下一页</button>
      </nav>}
    </>}
  </section>;
}
