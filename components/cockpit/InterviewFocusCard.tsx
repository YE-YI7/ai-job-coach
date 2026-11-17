"use client";

import { ArrowRight, MessageSquareText } from "lucide-react";
import type { InterviewFocus } from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";

/** The same question, readiness and callbacks; presentation belongs to the scoped preview frame. */
export default function InterviewFocusCard({ questions, index, onNavigate, onPractice, initiallyOpen = true }: {
  questions: InterviewFocus[];
  index: number;
  onNavigate: (index: number) => void;
  onPractice: (id: string) => void;
  initiallyOpen?: boolean;
}) {
  if (!questions.length) return null;
  const safeIndex = Math.min(index, questions.length - 1);
  const focus = questions[safeIndex];
  return <details className={styles.focusStepper} data-interview-part="focus" open={initiallyOpen}>
    <summary>岗位重点题 · 共 {questions.length} 题，逐题看</summary>
    <div className={styles.focusOne}>
      <div className={styles.focusDots} aria-label={`第 ${safeIndex + 1} 题，共 ${questions.length} 题`}>
        {questions.map((item, position) => <i key={item.id}
          data-state={position < safeIndex ? "done" : position === safeIndex ? "current" : "waiting"} />)}
        <small className={styles.focusCount}>{safeIndex + 1} / {questions.length}</small>
      </div>
      <article key={focus.id} data-interview-part="question">
        <span className={`${styles.readinessDot} ${styles[`readiness_${focus.readiness}`]}`} />
        <div><strong>{focus.question}</strong><p>{focus.rationale}</p></div>
        <em>{focus.readiness === "ready" ? "已准备" : focus.readiness === "practice" ? "需练习" : "待补充"}</em>
      </article>
      <div className={styles.focusStepperActions} data-interview-part="question-actions">
        <button type="button" className={styles.secondaryButton} data-question-action="previous"
          disabled={safeIndex === 0} onClick={() => onNavigate(safeIndex - 1)}>上一题</button>
        <button type="button" className={styles.secondaryButton} data-question-action="practice"
          onClick={() => onPractice(focus.id)}><MessageSquareText size={15} />练这一题</button>
        {safeIndex < questions.length - 1 && <button type="button" className={styles.primaryButton}
          data-question-action="next" onClick={() => onNavigate(safeIndex + 1)}>下一题<ArrowRight size={15} /></button>}
      </div>
    </div>
  </details>;
}
