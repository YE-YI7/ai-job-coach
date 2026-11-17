"use client";

import type { ReactNode } from "react";
import { ArrowRight, ChevronDown, Mic } from "lucide-react";
import styles from "./QoderInterviewWorkspace.module.css";
import ProgressiveInterviewSetup from "./ProgressiveInterviewSetup";

/** Presentation only: all choices, start and history use the existing interview state machine. */
export default function QoderInterviewLobby({
  role, roundLabel, roundType, questionCount, roundTypes, quotaLabel, starting, roundPicker,
  onRoundType, onQuestionCount, onStart, onSingle, onHistory, focus, error, example,
  progressiveSetup = false, renderRoundPicker,
}: {
  role: string;
  roundLabel: string;
  roundType: string;
  questionCount: number;
  roundTypes: readonly string[];
  quotaLabel: string;
  starting: boolean;
  roundPicker: ReactNode;
  onRoundType: (value: string) => void;
  onQuestionCount: (value: number) => void;
  onStart: () => void;
  onSingle: () => void;
  onHistory: () => void;
  focus: ReactNode;
  error: string;
  example: boolean;
  progressiveSetup?: boolean;
  renderRoundPicker?: (onConfirmed: () => void) => ReactNode;
}) {
  const progressive = progressiveSetup && Boolean(renderRoundPicker);
  const startControl = <div className={styles.startControl}>
    <button type="button" className={styles.orb} aria-label="开始模拟面试"
      disabled={starting} aria-busy={starting} onClick={onStart}>
      <Mic size={32} strokeWidth={1.4} aria-hidden="true" />
    </button>
    <span role="status">{starting ? "正在准备问题…" : "点一下，开始"}</span>
  </div>;
  return <section className={styles.lobby} aria-label="模拟面试大厅" data-qoder-surface="lobby"
    data-setup-mode={progressive ? "progressive" : "current"}>
    <div className={styles.heroCopy}>
      <p className={styles.eyebrow}>MOCK INTERVIEW · {role}</p>
      <h2 className={styles.heroTitle}>提前练一场。</h2>
      <p className={styles.lead}>{progressive ? "围绕当前岗位，选好这次要练的内容。"
        : <>围绕当前岗位，按<span>{roundLabel}</span>的强度问你。</>}</p>
    </div>
    {progressiveSetup && renderRoundPicker ? <ProgressiveInterviewSetup roundLabel={roundLabel}
      roundType={roundType} questionCount={questionCount} roundTypes={roundTypes}
      onRoundType={onRoundType} onQuestionCount={onQuestionCount}
      renderRoundPicker={renderRoundPicker} startControl={startControl} /> : <>
    {startControl}
    <details className={styles.setup}>
      <summary>{roundLabel}<span aria-hidden="true">·</span>{roundType}<span aria-hidden="true">·</span>{questionCount} 题
        <small>调整 <ChevronDown size={11} aria-hidden="true" /></small>
      </summary>
      <div className={styles.setupFields}>
        <div className={styles.fieldLabel}>这是第几面？</div>
        {roundPicker}
        <div className={styles.inlineFields}>
          <label>出题视角<select aria-label="选择模拟面试类型" value={roundType}
            onChange={event => onRoundType(event.target.value)}>
            {roundTypes.map(item => <option key={item}>{item}</option>)}
          </select></label>
          <label>题数<select aria-label="选择题数" value={questionCount}
            onChange={event => onQuestionCount(Number(event.target.value))}>
            {[3, 5, 8].map(count => <option key={count} value={count}>{count} 题</option>)}
          </select></label>
        </div>
      </div>
    </details>
    </>}
    <p className={styles.fine}>不想答就跳过 · 随时可以停</p>
    <p className={styles.fee}>{example ? "示例练习，不消耗额度" : quotaLabel}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.lobbyLinks}>
      <button type="button" onClick={onSingle}>先练一道题<ArrowRight size={14} aria-hidden="true" /></button>
      <button type="button" onClick={onHistory}>过往模拟面试<ArrowRight size={14} aria-hidden="true" /></button>
    </div>
    <div className={styles.questionBank}>{focus}</div>
  </section>;
}
