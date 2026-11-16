"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { interviewProgress, questionMatches, type InterviewHistoryQuestion, type InterviewHistorySession } from "@/lib/interview/history";
import TutorMarkdown from "./TutorMarkdown";
import { normalizeInterviewAssessment, scoreBandLine, scoreBandShort, type InterviewAssessmentView } from "./interview-assessment-logic";
import styles from "./InterviewRecords.module.css";

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

export function scoredTurns(session: InterviewHistorySession) {
  const entries: Array<{ turn: InterviewHistoryQuestion; index: number; assessment: InterviewAssessmentView }> = [];
  session.turns.forEach((turn, index) => {
    const assessment = latestAssessment(turn);
    if (assessment?.status === "assessed" && assessment.score !== null) entries.push({ turn, index, assessment });
  });
  return entries;
}

export function Highlight({ text, query }: { text: string; query: string }) {
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

export function InterviewResult({
  session, query = "", onHistory, onResume, verdict, statsExtra,
  beforeTranscript, afterTranscript, findings = {},
}: {
  session: InterviewHistorySession; query?: string; onHistory?: () => void; onResume?: () => void;
  verdict?: string;
  statsExtra?: ReactNode;
  beforeTranscript?: ReactNode;
  afterTranscript?: ReactNode;
  findings?: Record<string, { decisiveFinding: string; score?: number | null }>;
}) {
  const [search, setSearch] = useState(query);
  const [focused, setFocused] = useState<string | null>(null);
  const progress = interviewProgress(session);
  const scored = scoredTurns(session);
  const lowest = scored.length > 0
    ? [...scored].sort((left, right) => (left.assessment.score ?? 101) - (right.assessment.score ?? 101))[0]
    : null;
  const visible = session.turns.filter(turn => questionMatches(turn, search)
    || Boolean(search.trim() && turn.attempts.some(attempt => {
      const assessment = assessmentOf(attempt.assessment);
      return assessment && [
        assessment.summary, ...assessment.evidence, ...assessment.missingEvidence,
        ...assessment.rewritePlan,
      ].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    }))
    || Boolean(search.trim() && findings[turn.questionId]?.decisiveFinding
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const focusQuestion = (questionId: string) => {
    setSearch("");
    setFocused(questionId);
    window.requestAnimationFrame(() => {
      document.getElementById(`interview-${session.id}-${questionId}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  };
  const next = session.turns.find(turn => !turn.attempts.length && !turn.skipped);
  return <section className={styles.result} aria-label="模拟面试结果">
    <header className={styles.resultHeader}>
      <div>
        <p className={styles.meta}>{session.jobLabel ? `${session.jobLabel} · ` : ""}{session.round}{session.roundType ? ` · ${session.roundType}` : ""}</p>
        <h2>{progress.answered ? <>这一场，留下了 <strong>{progress.answered}</strong> 段回答。</> : "这一场，没有留下回答。"}</h2>
        <p>{verdict || (scored.length
          ? `其中 ${scored.length} 题有当时的逐题评分。先回看原话和证据缺口，再决定下一场先改哪一题。`
          : progress.answered
            ? "当时没有留下逐题评分，只有你的原话和作答进度。"
            : "没有可回看的回答，也没有评分。要练的话，从头再开一场即可。")}</p>
      </div>
      {onHistory && <button type="button" onClick={onHistory}>过往模拟面试 <ArrowRight size={16} /></button>}
    </header>
    <dl className={styles.resultStats}>
      <div><dt>留下回答</dt><dd>{progress.answered}<small> / {session.turns.length} 题</small></dd></div>
      <div><dt>有评分</dt><dd>{scored.length}<small> 题</small></dd></div>
      <div><dt>主动跳过</dt><dd>{progress.skipped}<small> 题</small></dd></div>
      {progress.longest && <div><dt>最长一段</dt><dd>
        <button type="button" onClick={() => focusQuestion(progress.longest!.questionId)}
          aria-label="回看最长一段回答">{progress.longest.length}<small> 字</small></button>
      </dd></div>}
      {statsExtra}
    </dl>
    {lowest && <section className={styles.focus} aria-label="下一场先补这一题">
      <span>本场最低 · {lowest.assessment.score} 分（{scoreBandShort(lowest.assessment.variance)}）</span>
      <h3>第 {lowest.index + 1} 题 · {lowest.turn.question}</h3>
      <p>{lowest.assessment.summary}</p>
      {lowest.assessment.missingEvidence[0] && <p className={styles.focusGap}><b>最缺的证据</b>{lowest.assessment.missingEvidence[0]}</p>}
      <button type="button" onClick={() => focusQuestion(lowest.turn.questionId)}>
        回看这题的原话 <ArrowRight size={14} />
      </button>
    </section>}
    <div className={styles.next}>
      <p>{session.status === "running" ? "这一场还没有结束，已保存的内容都在下面。"
        : next ? `还有 ${progress.unanswered + progress.unseen} 题没有留下回答。` : "这一场的原话已经收好，可以逐题回看。"}</p>
      {onResume && session.status === "running" && <button type="button" onClick={onResume}>接着练 <ArrowRight size={16} /></button>}
    </div>
    {beforeTranscript}
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
        id={`interview-${session.id}-${turn.questionId}`}
        open={Boolean(search) || focused === turn.questionId}
        onToggle={event => {
          if (!event.currentTarget.open && focused === turn.questionId) setFocused(null);
        }}>
        <summary>
          <span className={styles.transcriptIndex}>第 {index + 1} 题{turn.followsQuestionId ? " · 承接上一答" : ""}</span>
          <strong><Highlight text={turn.question} query={search} /></strong>
          <em className={styles.transcriptStatus} data-tone={tone}>{status}</em>
        </summary>
        <div className={styles.transcriptBody}>
          {findings[turn.questionId] && <section className={styles.feedback}>
            <h4>这一题的决定性判断</h4>
            <p><Highlight text={findings[turn.questionId].decisiveFinding} query={search} /></p>
            {findings[turn.questionId].score != null && <p className={styles.meta}>
              整轮总评中的本题评分：{findings[turn.questionId].score}
            </p>}
          </section>}
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
              {attemptAssessment?.status === "assessed" && <p className={styles.meta}>{scoreBandLine(attemptAssessment.variance)}</p>}
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
    {afterTranscript}
  </section>;
}


