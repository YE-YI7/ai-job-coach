"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import {
  scoreBandLine,
  scoreBandShort,
  type InterviewRoundSummaryView,
  type RoundtableTurnView,
} from "./interview-assessment-logic";
import common from "./CockpitApp.module.css";
import local from "./InterviewRoundReview.module.css";
const styles = { ...common, ...local };

const pad2 = (value: number) => String(value).padStart(2, "0");
function mockDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { day: "日期未记录", time: "" }
    : {
        day: `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`,
        time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
      };
}
const hasAnswer = (turn: RoundtableTurnView) =>
  Boolean(turn.answer?.trim()) && !turn.answer?.startsWith("[已跳过，未评分]");
const wasSkipped = (turn: RoundtableTurnView) =>
  Boolean(turn.skipped || turn.answer?.startsWith("[已跳过，未评分]"));
const assessedTurnsOf = (turns: RoundtableTurnView[]) =>
  turns.filter(
    (turn) => hasAnswer(turn) && turn.assessment?.status === "assessed",
  );
const missingEvidenceCountOf = (turns: RoundtableTurnView[]) =>
  turns.reduce(
    (sum, turn) => sum + (turn.assessment?.missingEvidence.length || 0),
    0,
  );
const scoreTone = (score: number | null | undefined) =>
  score == null ? "na" : score >= 70 ? "good" : score >= 45 ? "mid" : "low";

function highlightMatch(text: string, query: string) {
  const term = query.trim();
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .split(new RegExp(`(${escaped})`, "gi"))
    .map((part, index) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={`${index}-${part}`}>{part}</mark>
      ) : (
        <span key={`${index}-${part}`}>{part}</span>
      ),
    );
}

export default function InterviewRoundReview({
  summary,
  turns,
  selfReflection,
  round,
  createdAt,
  onOpenHistory,
  example,
  onRestart,
  onBack,
}: {
  summary: InterviewRoundSummaryView;
  turns: RoundtableTurnView[];
  selfReflection?: { questions: string[]; answers: string[] } | null;
  round: string;
  createdAt: string;
  onOpenHistory?: () => void;
  example: boolean;
  onRestart: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const date = mockDay(createdAt);
  const roundLabel = round;
  const answered = turns.filter(hasAnswer);
  const assessed = assessedTurnsOf(turns);
  const missing = missingEvidenceCountOf(turns);
  const longest =
    [...answered].sort(
      (a, b) => (b.answer?.length || 0) - (a.answer?.length || 0),
    )[0] || null;
  const longestIndex = longest ? turns.indexOf(longest) : -1;
  const breakdown = new Map(
    summary.questionBreakdown.map((entry) => [entry.questionId, entry]),
  );
  const lowest =
    [...assessed].sort(
      (a, b) => (a.assessment?.score ?? 101) - (b.assessment?.score ?? 101),
    )[0] || null;
  const lowestIndex = lowest ? turns.indexOf(lowest) : -1;
  const focusText = lowest
    ? lowest.assessment?.missingEvidence[0] ||
      breakdown.get(lowest.questionId)?.decisiveFinding ||
      lowest.assessment?.summary ||
      "这道题得分最低，下一场先把证据讲完整。"
    : summary.weaknesses[0] || summary.nextActions[0]?.title || "";
  const reflectionEntries = (selfReflection?.questions || [])
    .map((question, index) => ({
      question,
      answer: (selfReflection?.answers || [])[index] || "",
    }))
    .filter((entry) => entry.answer.trim());
  const term = query.trim().toLowerCase();
  const rows = turns.map((turn, index) => ({
    turn,
    index,
    finding: breakdown.get(turn.questionId)?.decisiveFinding || "",
  }));
  const filteredRows = term
    ? rows.filter(({ turn, finding }) =>
        [
          turn.question,
          turn.answer || "",
          turn.assessment?.summary || "",
          turn.assessment?.followUp || "",
          finding,
          ...(turn.assessment?.evidence || []),
          ...(turn.assessment?.missingEvidence || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : rows;
  const focusReviewQuestion = (index: number) => {
    setQuery("");
    setOpenQuestion(index);
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "auto"
        : "smooth";
      document
        .getElementById(`round-review-${index}`)
        ?.scrollIntoView({ behavior, block: "center" });
    });
  };
  return (
    <article className={styles.roundResult}>
      <header className={styles.resultHead}>
        <div className={styles.resultTopline}>
          <span className={styles.resultKicker}>
            MOCK · {roundLabel} · {date.day}
            {date.time ? ` ${date.time}` : ""}
          </span>
          {Boolean(onOpenHistory) && (
            <button
              type="button"
              className={styles.resultTextLink}
              onClick={onOpenHistory}
            >
              过往模拟面试 →
            </button>
          )}
        </div>
        <div className={styles.resultHeadGrid}>
          <div className={styles.resultHeadCopy}>
            <h2>
              {answered.length > 0 ? (
                <>
                  这一轮，你答了 <em>{answered.length}</em>
                  {"\u00a0"}题。
                </>
              ) : (
                "这一轮，还没留下回答。"
              )}
            </h2>
            <p>
              {summary.verdict ||
                "这轮没有生成整轮总评。逐题反馈和你写的复盘已经保存。"}
            </p>
          </div>
          <div className={styles.resultScoreBlock}>
            <span className={styles.resultKicker}>整轮评分</span>
            <strong>
              {summary.overallScore}
              <small>/100</small>
            </strong>
            <span className={styles.resultGrade}>{summary.grade}</span>
            <p>{scoreBandLine(summary.variance)}</p>
          </div>
        </div>
      </header>

      <div className={styles.resultOverview}>
        <section
          className={styles.resultCoverage}
          aria-label="这一轮的作答进度"
        >
          <div className={styles.resultCoverHead}>
            <span className={styles.resultKicker}>作答进度</span>
            <strong>
              {answered.length}
              <small> / {turns.length} 题</small>
            </strong>
          </div>
          <div
            className={styles.resultStrip}
            style={{
              gridTemplateColumns: `repeat(${Math.max(turns.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {turns.map((turn, index) => {
              const state =
                hasAnswer(turn) && turn.assessment?.status === "assessed"
                  ? "assessed"
                  : hasAnswer(turn)
                    ? "answered"
                    : wasSkipped(turn)
                      ? "skipped"
                      : "open";
              const label = {
                assessed: "已评",
                answered: "已答未评",
                skipped: "跳过",
                open: "未答",
              }[state];
              return (
                <span
                  key={turn.questionId}
                  className={styles.resultStop}
                  data-state={state}
                  aria-label={`第${index + 1}题，${label}`}
                >
                  <i />
                  <b>{pad2(index + 1)}</b>
                  <small>{label}</small>
                </span>
              );
            })}
          </div>
          <div className={styles.resultLegend}>
            <span data-state="assessed">
              <i />
              已评
            </span>
            <span data-state="answered">
              <i />
              已答未评
            </span>
            <span data-state="open">
              <i />
              未答
            </span>
            <span data-state="skipped">
              <i />
              跳过
            </span>
          </div>
          {longest && longest.answer ? (
            <blockquote className={styles.resultQuote}>
              <span className={styles.resultKicker}>这一轮最长的一段回答</span>
              <p>
                “{longest.answer.trim().slice(0, 170)}
                {longest.answer.trim().length > 170 ? "…" : ""}”
              </p>
              <footer>
                <span>第 {pad2(longestIndex + 1)} 题</span>
                {longestIndex >= 0 && (
                  <button
                    type="button"
                    onClick={() => focusReviewQuestion(longestIndex)}
                  >
                    重看这题
                  </button>
                )}
              </footer>
            </blockquote>
          ) : (
            <p className={styles.resultEmpty}>这一轮没有留下回答原话。</p>
          )}
        </section>
        <div className={styles.resultNums}>
          <div>
            <span>回答</span>
            <strong>
              {answered.length}
              <small>题</small>
            </strong>
          </div>
          <div>
            <span>逐题评分</span>
            <strong>
              {assessed.length}
              <small> / {turns.length} 题</small>
            </strong>
          </div>
          <div data-tone={missing > 0 ? "warn" : "good"}>
            <span>证据缺口</span>
            <strong>
              {missing}
              <small>条</small>
            </strong>
          </div>
          <div>
            <span>下一步</span>
            <strong>
              {summary.nextActions.length}
              <small>个</small>
            </strong>
          </div>
        </div>
      </div>

      {focusText && (
        <div className={styles.resultNext}>
          <i aria-hidden="true" />
          <p>
            <b>下一场先补</b>
            {focusText}
          </p>
          {lowestIndex >= 0 && (
            <button
              type="button"
              onClick={() => focusReviewQuestion(lowestIndex)}
            >
              重看第 {lowestIndex + 1} 题
            </button>
          )}
        </div>
      )}

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

      <section className={styles.resultSection}>
        <div className={styles.resultQuestionHead}>
          <div>
            <span className={styles.resultKicker}>逐题回看</span>
            <h3>每一题，为什么是这个分</h3>
          </div>
          <label className={styles.resultSearch}>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜问题、回答或点评"
              aria-label="搜索本轮问题或回答"
            />
            <span>
              {filteredRows.length} / {turns.length} 题
            </span>
          </label>
        </div>
        <div className={styles.resultQuestionList}>
          {filteredRows.map(({ turn, index, finding }) => {
            const isOpen = openQuestion === index;
            const answer = turn.answer?.startsWith("[已跳过，未评分]")
              ? ""
              : turn.answer?.trim() || "";
            const assessment = turn.assessment;
            const statusLabel =
              assessment?.status === "assessed"
                ? `${assessment.score ?? "—"} 分`
                : answer
                  ? "已答未评"
                  : wasSkipped(turn)
                    ? "已跳过"
                    : "未答";
            const statusTone =
              assessment?.status === "assessed"
                ? scoreTone(assessment.score)
                : answer
                  ? "answered"
                  : "open";
            const excerpt =
              assessment?.summary ||
              finding ||
              answer ||
              "这一题没有留下回答。";
            return (
              <article
                key={turn.questionId}
                id={`round-review-${index}`}
                className={styles.resultQuestion}
                data-open={isOpen}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenQuestion(isOpen ? null : index)}
                >
                  <span className={styles.resultQIndex}>{pad2(index + 1)}</span>
                  <span className={styles.resultQTitle}>
                    {highlightMatch(turn.question, query)}
                  </span>
                  <span className={styles.resultQStatus} data-tone={statusTone}>
                    {statusLabel}
                  </span>
                  <span className={styles.resultQExcerpt}>
                    {highlightMatch(excerpt, query)}
                  </span>
                </button>
                {isOpen && (
                  <div className={styles.resultQBody}>
                    <section>
                      <b>你的回答</b>
                      {answer ? (
                        <p>{highlightMatch(answer, query)}</p>
                      ) : (
                        <p className={styles.resultMuted}>
                          这一题还没有留下回答。
                        </p>
                      )}
                    </section>
                    {finding && (
                      <section>
                        <b>这一题的决定性判断</b>
                        <p>{highlightMatch(finding, query)}</p>
                      </section>
                    )}
                    {assessment?.status === "assessed" && (
                      <>
                        <p className={styles.resultQBand}>
                          {assessment.score ?? "—"} 分 ·{" "}
                          {scoreBandShort(assessment.variance)} ·{" "}
                          {scoreBandLine(assessment.variance)}
                        </p>
                        <section>
                          <b>用人经理的点评</b>
                          <p>{highlightMatch(assessment.summary, query)}</p>
                        </section>
                        {(assessment.evidence.length > 0 ||
                          assessment.missingEvidence.length > 0) && (
                          <div className={styles.resultQSplit}>
                            {assessment.evidence.length > 0 && (
                              <section>
                                <b>站得住的证据</b>
                                <ul className={styles.dotListGood}>
                                  {assessment.evidence.map((item) => (
                                    <li key={item}>
                                      {highlightMatch(item, query)}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            )}
                            {assessment.missingEvidence.length > 0 && (
                              <section>
                                <b>缺口与冲突</b>
                                <ul className={styles.dotListWarn}>
                                  {assessment.missingEvidence.map((item) => (
                                    <li key={item}>
                                      {highlightMatch(item, query)}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            )}
                          </div>
                        )}
                        {assessment.followUp && (
                          <footer>
                            <b>面试官会继续问</b>
                            <p>{highlightMatch(assessment.followUp, query)}</p>
                          </footer>
                        )}
                      </>
                    )}
                    {assessment?.status === "needs_more_input" && (
                      <section>
                        <b>这一题当时没给分</b>
                        <p>{highlightMatch(assessment.summary, query)}</p>
                      </section>
                    )}
                    {!assessment && answer && (
                      <p className={styles.resultMuted}>
                        这一题留下了回答，但没有逐题评分。
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {filteredRows.length === 0 && (
          <p className={styles.resultEmpty}>没有找到。换个词试试。</p>
        )}
      </section>

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
          <button className={styles.primaryButton} onClick={onRestart}>
            再练一场
            <ArrowRight size={15} />
          </button>
          <button className={styles.secondaryButton} onClick={onBack}>
            回到面试准备
          </button>
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
    </article>
  );
}
