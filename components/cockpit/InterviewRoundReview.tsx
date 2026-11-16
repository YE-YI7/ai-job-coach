"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import type { InterviewHistorySession } from "@/lib/interview/history";
import { InterviewResult } from "./InterviewResult";
import { scoreBandLine, type InterviewRoundSummaryView, type RoundtableTurnView } from "./interview-assessment-logic";
import common from "./CockpitApp.module.css";
import local from "./InterviewRoundReview.module.css";
import records from "./InterviewRecords.module.css";
const styles = { ...common, ...local };
const scoreTone = (score: number | null | undefined) =>
  score == null ? "na" : score >= 70 ? "good" : score >= 45 ? "mid" : "low";

export default function InterviewRoundReview({
  summary, turns, selfReflection, round, createdAt, onOpenHistory,
  example, onRestart, onBack, backLabel = "回到面试准备",
}: {
  summary: InterviewRoundSummaryView;
  turns: RoundtableTurnView[];
  selfReflection?: { questions: string[]; answers: string[] } | null;
  round: string;
  createdAt: string;
  onOpenHistory?: () => void;
  example: boolean;
  onRestart?: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  // Presentation-only projection: retain every saved attempt and never rewrite storage.
  const session: InterviewHistorySession = {
    id: "round-review-" + createdAt,
    opportunityId: null, roundType: "", round, createdAt,
    status: "completed", currentIndex: Math.max(0, turns.length - 1),
    turns: turns.map(turn => ({
      ...turn,
      skipped: Boolean(turn.skipped || turn.answer?.startsWith("[已跳过，未评分]")),
      assessment: turn.assessment ? { ...turn.assessment } : undefined,
      attempts: turn.attempts?.length ? turn.attempts : (turn.answer?.trim() && !turn.answer.startsWith("[已跳过，未评分]") ? [{
        id: "round-answer-" + turn.questionId, answer: turn.answer,
        createdAt, state: "saved" as const,
        assessment: turn.assessment ? { ...turn.assessment } : undefined,
      }] : []),
    })),
  };
  const reflectionEntries = (selfReflection?.questions || []).map((question, index) => ({
    question, answer: selfReflection?.answers[index] || "",
  })).filter(entry => entry.answer.trim());
  const findings = Object.fromEntries(summary.questionBreakdown.map(item => [item.questionId, item]));
  const missing = turns.reduce((total, turn) =>
    total + (turn.assessment?.missingEvidence.length || 0), 0);
  return <article className={styles.roundResult}>
    <InterviewResult session={session} onHistory={onOpenHistory} verdict={summary.verdict}
      findings={findings}
      statsExtra={<>
        <div><dt>证据缺口</dt><dd>{missing}<small> 条</small></dd></div>
        <div><dt>下一步</dt><dd>{summary.nextActions.length}<small> 个</small></dd></div>
      </>}
      beforeTranscript={<>
        <section className={records.summary} aria-label="整轮总评">
          <div><h3>整轮总评</h3><p>{scoreBandLine(summary.variance)}</p>
            {!Number.isNaN(Date.parse(createdAt)) && <p><time dateTime={createdAt}>
              {new Date(createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </time></p>}
          </div>
          <strong>{summary.overallScore}<small> / 100</small></strong>
          <span>{summary.grade}</span>
        </section>
      {summary.dimensions.length > 0 && (
        <section className={styles.resultSection}>
          <header className={styles.resultSectionHead}>
            <span className={styles.resultKicker}>本轮评价</span>
            <p>每条维度只按这一轮的回答打分。</p>
          </header>
          <div className={styles.resultDimensions}>
            {summary.dimensions.map((dimension) => {
              const pct = Math.max(0, Math.min(100, dimension.score));
              return (
                <div key={dimension.name} className={styles.resultDimension}>
                  <div className={styles.resultDimHead}>
                    <span>{dimension.name}</span>
                    <em>{dimension.score}</em>
                  </div>
                  <i className={`${common.dimensionTrack} ${local.dimensionTrack}`}>
                    <b
                      style={{ width: `${pct}%` }}
                      data-tone={scoreTone(dimension.score)}
                    />
                  </i>
                  {dimension.comment && <p>{dimension.comment}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(summary.strengths.length > 0 || summary.weaknesses.length > 0) && (
        <section
          className={`${styles.resultSection} ${styles.resultKeepChange}`}
        >
          {summary.strengths.length > 0 && (
            <div>
              <span className={styles.resultKicker}>保留</span>
              <ul className={styles.dotListGood}>
                {summary.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.weaknesses.length > 0 && (
            <div>
              <span className={styles.resultKicker}>先改</span>
              <ul className={styles.dotListWarn}>
                {summary.weaknesses.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {summary.nextActions.length > 0 && (
        <section className={styles.resultSection}>
          <header className={styles.resultSectionHead}>
            <span className={styles.resultKicker}>下一场先做</span>
            <p>来自本轮已保存的导师点评。</p>
          </header>
          <ol className={styles.resultActions}>
            {summary.nextActions.map((action, index) => (
              <li key={`${action.title}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <header>
                    <b>{action.title}</b>
                    <em data-priority={action.priority}>
                      {action.priority === "urgent"
                        ? "紧急"
                        : action.priority === "high"
                          ? "重要"
                          : "常规"}
                    </em>
                  </header>
                  <p>{action.reason}</p>
                  {action.doneWhen && (
                    <small>完成标准：{action.doneWhen}</small>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      </>}
      afterTranscript={<>
      {reflectionEntries.length > 0 && (
        <details className={styles.resultReflection}>
          <summary>
            你自己先写的复盘 · {reflectionEntries.length} 条
            <ChevronDown size={15} />
          </summary>
          <ul>
            {reflectionEntries.map((entry) => (
              <li key={entry.question}>
                <b>{entry.question}</b>
                <p>{entry.answer}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className={styles.resultFoot}>
        <div>
          {onRestart && (
            <button className={styles.primaryButton} onClick={onRestart}>
              再练一场
              <ArrowRight size={15} />
            </button>
          )}
          {onBack && (
            <button className={styles.secondaryButton} onClick={onBack}>
              {backLabel}
            </button>
          )}
        </div>
        {Boolean(onOpenHistory) && (
          <button
            type="button"
            className={styles.resultTextLink}
            onClick={onOpenHistory}
          >
            看全部过往记录 →
          </button>
        )}
        <p className={styles.resultFine}>
          分数来自这一轮的逐题评审，证据缺口按题目累计。
          {example ? "当前是示例工作区，这一轮的分数与点评为演示数据。" : ""}
        </p>
      </footer>
      </>}
    />
  </article>;
}
