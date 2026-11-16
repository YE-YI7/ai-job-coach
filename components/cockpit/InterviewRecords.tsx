"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { interviewProgress, questionMatches, type InterviewHistorySession } from "@/lib/interview/history";
import InterviewRoundReview from "./InterviewRoundReview";
import {
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  type InterviewAssessmentView,
  type InterviewRoundSummaryView,
  type RoundtableTurnView,
} from "./interview-assessment-logic";
import styles from "./InterviewRecords.module.css";

const COMMON_ROUNDS = ["电话初筛", "一面", "二面", "三面", "终面", "HR面"];

function assessmentOf(raw: unknown): InterviewAssessmentView | null {
  const source = raw && typeof raw === "object" && "source" in raw && (raw as { source?: unknown }).source === "demo" ? "demo" : "llm";
  return normalizeInterviewAssessment(raw, source);
}


export { InterviewResult } from "./InterviewResult";
import { InterviewResult, scoredTurns, Highlight } from "./InterviewResult";
function HistoryRoundReview({ session, summary, example, onBack }: {
  session: InterviewHistorySession; summary: InterviewRoundSummaryView; example: boolean; onBack: () => void;
}) {
  const turns: RoundtableTurnView[] = session.turns.map(turn => {
    const latest = turn.attempts.at(-1);
    const assessment = assessmentOf(latest?.assessment ?? turn.assessment);
    return {
      questionId: turn.questionId,
      question: turn.question,
      rationale: turn.rationale,
      answer: latest?.answer ?? turn.answer,
      attempts: turn.attempts,
      seenAt: turn.seenAt,
      skipped: turn.skipped,
      followsQuestionId: turn.followsQuestionId,
      ...(assessment ? { assessment } : {}),
    };
  });
  return <InterviewRoundReview summary={summary} turns={turns} round={session.round} createdAt={session.createdAt}
    example={example} onBack={onBack} backLabel="回到记录" />;
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
    <header className={styles.historyHeader}>
      <div>
        <button type="button" onClick={onClose}><ArrowLeft size={16} />返回面试准备</button>
        <span className={styles.historyKicker}>HISTORY · 模拟面试</span>
        <h2>练过的，都留着。</h2>
        <p>{demoSessions ? "虚构示例，仅演示界面，不是你的真实历史。" : "按轮次、岗位、问题或回答找。只显示当前账号的记录。"}</p>
      </div>
    </header>
    <form className={styles.historyForm} onSubmit={event => {
      event.preventDefault(); setQuery(search.trim()); setRound(roundDraft.trim()); setPage(1); setSelected(null);
    }}>
      <label className={styles.historySearch}>
        <Search size={16} aria-hidden="true" />
        <input type="search" value={search} maxLength={80} placeholder="搜轮次、岗位、问题或回答里的词"
          aria-label="搜索过往模拟面试"
          onChange={event => setSearch(event.target.value)} />
        {(search || query || roundDraft || round) && <button type="button" onClick={() => {
          setSearch(""); setQuery(""); setRound(""); setRoundDraft(""); setPage(1); setSelected(null);
        }}>清空</button>}
      </label>
      <div className={styles.historyFilterRow}>
        <label className={styles.historyRound}>
          <span>轮次</span>
          <input list="interview-history-round-options" value={roundDraft} maxLength={24} placeholder="全部轮次"
            onChange={event => setRoundDraft(event.target.value)} />
          <datalist id="interview-history-round-options">
            {COMMON_ROUNDS.map(value => <option key={value} value={value} />)}
          </datalist>
        </label>
        {!demoSessions && <div className={styles.historyScope} role="group" aria-label="按岗位范围筛选">
          <button type="button" className={!allJobs ? styles.scopeActive : styles.scope} aria-pressed={!allJobs}
            onClick={() => { setAllJobs(false); setPage(1); setSelected(null); }}>当前岗位</button>
          <button type="button" className={allJobs ? styles.scopeActive : styles.scope} aria-pressed={allJobs}
            onClick={() => { setAllJobs(true); setPage(1); setSelected(null); }}>全部岗位</button>
        </div>}
        <button type="submit" className={styles.historySubmit}>查找</button>
      </div>
    </form>
    {loading ? <p role="status" className={styles.historyStatus}>正在读取历史记录…</p> : error ? <div role="alert" className={styles.historyError}>
      <p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>重新读取</button></div> : <>
      <p className={styles.historyCount} role="status">{total} 场{query ? ` · “${query}”` : ""}{round ? ` · ${round}` : ""}</p>
      {!sessions.length && <p role="status" className={styles.historyEmpty}>
        {query || round ? "没有匹配的记录，换个关键词或清空筛选。" : "还没有模拟面试记录。完成一次练习后，可以在这里回看。"}</p>}
      <div className={styles.historyList}>
        {sessions.map(session => {
          const progress = interviewProgress(session);
          const date = new Date(session.createdAt);
          const validDate = Number.isFinite(date.getTime());
          const summary = normalizeRoundSummary(session.summary);
          const assessed = scoredTurns(session).length;
          const excerpt = summary?.verdict || progress.longest?.answer || "";
          const isOpen = selected === session.id;
          return <article className={styles.historyRow} key={session.id}>
            <button type="button" className={styles.historyToggle} aria-expanded={isOpen}
              onClick={() => setSelected(value => value === session.id ? null : session.id)}>
              <span className={styles.historyDay}>
                <time dateTime={validDate ? session.createdAt : undefined}>
                  {validDate ? date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : "日期未记录"}
                </time>
                <small>{validDate ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}</small>
              </span>
              <span className={styles.historyIdentity}>
                <strong>{session.round}{session.jobLabel ? ` · ${session.jobLabel}` : ""}
                  {session.status === "running" && <em className={styles.historyRunning}>进行中</em>}</strong>
                <span className={styles.historyFacts}>{progress.answered} / {session.turns.length} 题留下回答
                  {assessed ? ` · ${assessed} 题已评` : ""}{summary ? ` · ${summary.overallScore} 分` : ""}</span>
                {excerpt && <small><Highlight text={excerpt} query={query} /></small>}
              </span>
              <ChevronDown size={17} aria-hidden="true" className={styles.historyChevron} />
            </button>
            {isOpen && <div className={styles.historyDetail}>
              {summary
                ? <HistoryRoundReview session={session} summary={summary} example={Boolean(demoSessions)} onBack={() => setSelected(null)} />
                : <InterviewResult session={session} query={query} onResume={() => onResume(session)} />}
            </div>}
          </article>;
        })}
      </div>
      {total > 10 && <nav className={styles.pagination} aria-label="历史记录分页">
        <button type="button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setSelected(null); }}>上一页</button>
        <span>{page} / {Math.ceil(total / 10)}</span>
        <button type="button" disabled={page * 10 >= total} onClick={() => { setPage(value => value + 1); setSelected(null); }}>下一页</button>
      </nav>}
    </>}
  </section>;
}
