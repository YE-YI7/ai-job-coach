"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import VoiceControls from "./VoiceControls";
import styles from "./QoderInterviewWorkspace.module.css";

/** Voice/text disclosure only. Never submits, evaluates or clears an answer. */
export default function QoderAnswerComposer({ value, onChange, question, textareaId, disabled, blocked }: {
  value: string;
  onChange: (value: string) => void;
  question: string;
  textareaId: string;
  disabled: boolean;
  blocked: boolean;
}) {
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const showText = typing || Boolean(value) || blocked;
  useEffect(() => {
    if (typing) input.current?.focus({ preventScroll: true });
  }, [typing]);
  return <div className={styles.answerSurface} data-qoder-part="answer-surface" data-mode={showText ? "text" : "voice"}>
    {showText && <>
      <label htmlFor={textareaId}>你的回答<span>{value.trim().length ? `${value.trim().length} 字` : "用自己的话说"}</span></label>
      <textarea ref={input} id={textareaId} aria-label="你的回答" rows={6} value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={blocked ? "根据反馈把证据补完整…" : "像真实面试一样回答，不确定的数字可以明确说待核实…"} />
    </>}
    <div className={styles.answerVoice}>
      <VoiceControls value={value} onChange={onChange} readText={question} disabled={disabled} />
    </div>
    {!showText && <button type="button" className={styles.typingLink} onClick={() => setTyping(true)}>
      <Keyboard size={15} aria-hidden="true" />打字回答
    </button>}
  </div>;
}
