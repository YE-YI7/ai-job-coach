"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Search } from "lucide-react";
import { interviewProgress, questionMatches, type InterviewHistoryQuestion, type InterviewHistorySession } from "@/lib/interview/history";
import TutorMarkdown from "./TutorMarkdown";
import InterviewRoundReview from "./InterviewRoundReview";
import {
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  scoreBandShort,
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

/** 历史记录里一题可能重答多次；回看时取最后一次留下的反馈。 */
function latestAssessment(turn: InterviewHistoryQuestion) {
  for (let index = turn.attempts.length - 1; index >= 0; index -= 1) {
    const assessment = assessmentOf(turn.attempts[index].assessment);
    if (assessment) return assessment;
  }
  return null;
}

function scoredTurns(session: InterviewHistorySession) {
  const entries: Array<{ turn: InterviewHistoryQuestion; index: number; assessment: InterviewAssessmentView }> = [];
  session.turns.forEach((turn, index) => {
    const assessment = latestAssessment(turn);
    if (assessment?.status === "assessed" && assessment.score !== null) entries.push({ turn, index, assessment });
  });
  return entries;
}

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
  const assessment = assessmentOf(value);
  if (!assessment) return null;
  return <div className={styles.feedback}>
    <div className={styles.feedbackSummary}><TutorMarkdown>{assessment.summary}</TutorMarkdown></div>
    {(assessment.evidence.length > 0 || assessment.missingEvidence.length > 0) && <div className={styles.feedbackColumns}>
      {assessment.evidence.length > 0 && <section><h4>站得住的证据</h4>
        <ul className={styles.goodList}>{assessment.evidence.map((text, index) => <li key={index}><TutorMarkdown>{text}</TutorMarkdown></li>)}</ul>
      </section>}
      {assessment.missingEvidence.length > 0 && <section><h4>还缺的证据</h4>
        <ul className={styles.warnList}>{assessment.missingEvidence.map((text, index) => <li key={index}><TutorMarkdown>{text}</TutorMarkdown></li>)}</ul>
      </section>}
    </div>}
    {assessment.rewritePlan.length > 0 && <section><h4>下一场这样重答</h4>
      <ol className={styles.planList}>{assessment.rewritePlan.map((text, index) => <li key={index}><TutorMarkdown>{text}</TutorMarkdown></li>)}</ol>
    </section>}
    {assessment.dimensions.length > 0 && <p className={styles.dimensions}>
      {assessment.dimensions.map((dimension, index) => <span key={index}>{dimension.name}{dimension.score === undefined ? "" : ` ${dimension.score}`}</span>)}
    </p>}
  </div>;
}

export function InterviewResult({ session, query = "", onHistory, onResume }: {
  session: InterviewHistorySession; query?: string; onHistory?: () => void; onResume?: () => void;
}) {
  const [search, setSearch] = useState(query);
  const progress = interviewProgress(session);
  const scored = scoredTurns(session);
  const lowest = scored.length > 1
    ? [...scored].sort((left, right) => (left.assessment.score ?? 101) - (right.assessment.score ?? 101))[0]
    : null;
  const visible = session.turns.filter(turn => questionMatches(turn, search));
  const next = session.turns.find(turn => !turn.attempts.length && !turn.skipped);
  return <section className={styles.result} aria-label="模拟面试结果">
    <header className={styles.resultHeader}>
      <div>
        <p className={styles.meta}>{session.jobLabel ? `${session.jobLabel} · ` : ""}{session.round}{session.roundType ? ` · ${session.roundType}` : ""}</p>
        <h2>{progress.answered ? <>这一场，留下了 <strong>{progress.answered}</strong> 段回答。</> : "这一场，没有留下回答。"}</h2>
        <p>{scored.length
          ? `其中 ${scored.length} 题有当时的逐题评分。先回看原话和证据缺口，再决定下一场先改哪一题。`
          : progress.answered
            ? "当时没有留下逐题评分，只有你的原话和作答进度。"
            : "没有可回看的回答，也没有评分。要练的话，从头再开一场即可。"}</p>
      </div>
      {onHistory && <button type="button" onClick={onHistory}>过往模拟面试 <ArrowRight size={16} /></button>}
    </header>
    <dl className={styles.resultStats}>
      <div><dt>留下回答</dt><dd>{progress.answered}<small> / {session.turns.length} 题</small></dd></div>
      <div><dt>有评分</dt><dd>{scored.length}<small> 题</small></dd></div>
      <div><dt>主动跳过</dt><dd>{progress.skipped}<small> 题</small></dd></div>
      {progress.longest && <div><dt>最长一段</dt><dd>{progress.longest.length}<small> 字</small></dd></div>}
    </dl>
    {lowest && <section className={styles.focus} aria-label="下一场先补这一题">
      <span>本场最低 · {lowest.assessment.score} 分（{scoreBandShort(lowest.assessment.variance)}）</span>
      <h3>第 {lowest.index + 1} 题 · {lowest.turn.question}</h3>
      <p>{lowest.assessment.summary}</p>
      {lowest.assessment.missingEvidence[0] && <p className={styles.focusGap}><b>最缺的证据</b>{lowest.assessment.missingEvidence[0]}</p>}
      <a href={`#interview-${session.id}-${lowest.turn.questionId}`}>回看这题的原话 <ArrowRight size={14} /></a>
    </section>}
    <div className={styles.next}>
      <p>{session.status === "running" ? "这一场还没有结束，已保存的内容都在下面。"
        : next ? `还有 ${progress.unanswered + progress.unseen} 题没有留下回答。` : "这一场的原话已经收好，可以逐题回看。"}</p>
      {onResume && session.status === "running" && <button type="button" onClick={onResume}>接着练 <ArrowRight size={16} /></button>}
    </div>
    <header className={styles.transcriptHeader}><h3>逐题回看</h3><label><Search size={16} aria-hidden="true" />
      <input type="search" aria-label="搜索本轮问题与回答" placeholder="搜索问题或回答" value={search} maxLength={80}
        onChange={event => setSearch(event.target.value)} /></label><span>{visible.length} / {session.turns.length} 题</span></header>
    {!visible.length && <p role="status">没有找到这段原话，换个关键词试试。</p>}
    {visible.map(turn => {
      const index = session.turns.indexOf(turn);
      const assessment = latestAssessment(turn);
      const score = assessment?.status === "assessed" ? assessment.score : null;
      const status = score !== null ? `${score} 分`
        : turn.attempts.length ? "已答未评"
          : turn.skipped ? "主动跳过" : turn.seenAt ? "没有回答" : "未记录";
      const tone = score !== null ? (score >= 70 ? "good" : score >= 45 ? "mid" : "low")
        : turn.attempts.length ? "answered" : "open";
      return <details className={styles.transcript} key={turn.questionId}
        id={`interview-${session.id}-${turn.questionId}`} open={Boolean(search)}>
        <summary>
          <span className={styles.transcriptIndex}>第 {index + 1} 题{turn.followsQuestionId ? " · 承接上一答" : ""}</span>
          <strong><Highlight text={turn.question} query={search} /></strong>
          <em className={styles.transcriptStatus} data-tone={tone}>{status}</em>
        </summary>
        <div className={styles.transcriptBody}>
          {!turn.attempts.length && <p className={styles.transcriptNote}>
            {turn.skipped ? "这题主动跳过，没有计为回答。" : turn.seenAt ? "这题还没有回答。" : "没有保存这题的作答记录。"}
          </p>}
          {turn.attempts.map((attempt, attemptIndex) => {
            const attemptAssessment = assessmentOf(attempt.assessment);
            return <article className={styles.attempt} key={attempt.id}>
              <p className={styles.meta}>第 {attemptIndex + 1} 次回答{attemptAssessment?.status === "assessed" && attemptAssessment.score !== null
                ? ` · ${attemptAssessment.score} 分（${scoreBandShort(attemptAssessment.variance)}）`
                : attempt.state === "pending" ? " · 反馈待完成" : ""}</p>
              <p className={styles.answer}><Highlight text={attempt.answer} query={search} /></p>
              {attempt.assessment && <SavedFeedback value={attempt.assessment} />}
              {typeof attempt.assessment?.followUp === "string" && attempt.assessment.followUp && <div className={styles.feedbackQuestion}>
                <span>当时反馈建议追问（不计入实际追问次数）</span><p><Highlight text={attempt.assessment.followUp} query={search} /></p>
              </div>}
            </article>;
          })}
        </div>
      </details>;
    })}
    <p className={styles.resultFine}>分数来自当时的逐题评审；同一答案重跑可能上下浮动。没有逐题评分的回答不补分。</p>
  </section>;
}

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
