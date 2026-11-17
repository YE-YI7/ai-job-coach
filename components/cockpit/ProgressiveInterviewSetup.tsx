"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import styles from "./ProgressiveInterviewSetup.module.css";

/** Progressive presentation only. Choices remain in the existing interview state machine. */
export default function ProgressiveInterviewSetup({
  roundLabel, roundType, questionCount, roundTypes, onRoundType, onQuestionCount,
  renderRoundPicker, startControl,
}: {
  roundLabel: string;
  roundType: string;
  questionCount: number;
  roundTypes: readonly string[];
  onRoundType: (value: string) => void;
  onQuestionCount: (value: number) => void;
  renderRoundPicker: (onConfirmed: () => void) => ReactNode;
  startControl: ReactNode;
}) {
  const [phase, setPhase] = useState<"round" | "focus" | "ready">("round");
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [phase]);

  return <div className={styles.setup} data-progressive-phase={phase}>
    <div className={styles.phase} key={phase}>
      {phase === "round" && <>
        <h3 ref={heading} tabIndex={-1}>准备第几面？</h3>
        <p className={styles.explanation}>先标记这次练习的轮次，再选要练的内容。</p>
        <div className={styles.roundStage}>
          {renderRoundPicker(() => setPhase("focus"))}
        </div>
        <button type="button" className={styles.shortcut} onClick={() => setPhase("ready")}>
          <span>用当前设置直接练</span>
          <small>{roundLabel} · {roundType} · {questionCount} 题</small>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </>}
      {phase === "focus" && <>
        <div className={styles.chosenRound}>
          <span>这次准备 <strong>{roundLabel}</strong></span>
          <button type="button" onClick={() => setPhase("round")}>改轮次</button>
        </div>
        <h3 ref={heading} tabIndex={-1}>这一轮，重点练什么？</h3>
        <div className={styles.choices} role="group" aria-label="选择模拟面试类型">
          {roundTypes.map(type => <button type="button" key={type} aria-pressed={roundType === type}
            onClick={() => onRoundType(type)}>{type}</button>)}
        </div>
        <div className={styles.quantity}>
          <span>这次练几题</span>
          <div role="group" aria-label="选择题数">
            {[3, 5, 8].map(count => <button type="button" key={count} aria-pressed={questionCount === count}
              onClick={() => onQuestionCount(count)}>{count} 题</button>)}
          </div>
        </div>
        <div className={styles.nextAction}>
          <button type="button" onClick={() => setPhase("ready")}>
            确认这组设置<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </>}
      {phase === "ready" && <>
        <h3 ref={heading} className={styles.readyTitle} tabIndex={-1}>准备好了。</h3>
        <p className={styles.readySummary}>{roundLabel}<span>·</span>{roundType}<span>·</span>{questionCount} 题</p>
        {startControl}
        <button type="button" className={styles.back} onClick={() => setPhase("focus")}>
          <ArrowLeft size={14} aria-hidden="true" />再调整一下
        </button>
      </>}
    </div>
    <p className="sr-only" role="status">
      {phase === "round" ? "先选择面试轮次" : phase === "focus"
        ? `已选${roundLabel}，请选择出题视角和题数` : `设置已确认：${roundLabel}、${roundType}、${questionCount}题。尚未开始面试。`}
    </p>
  </div>;
}
