"use client";

import type { ReactNode } from "react";
import VoiceControls from "./VoiceControls";
import styles from "./CockpitApp.module.css";
import QoderReviewComposer from "./QoderReviewComposer";

/** Only the composer markup is extracted. The parent retains round, notes, async callbacks and clearing rules. */
export default function ReviewMaterialComposer({
  notes, onChange, voiceDisabled, roundPicker, children, qoder = false, roundLabel,
}: {
  notes: string;
  onChange: (value: string) => void;
  voiceDisabled: boolean;
  roundPicker: ReactNode;
  children: ReactNode;
  qoder?: boolean;
  roundLabel?: string;
}) {
  if (qoder) return <QoderReviewComposer notes={notes} onChange={onChange} voiceDisabled={voiceDisabled}
    roundPicker={roundPicker} roundLabel={roundLabel}>{children}</QoderReviewComposer>;
  return <div className={styles.reviewComposer} data-interview-part="review-composer">
    <section data-interview-part="round-field">
    <div className={styles.reviewComposerHead}>
      <span>这是第几面？</span>
      <small>轮次用词和「模拟面试」一致，四面、五面直接填就行。</small>
    </div>
    <div data-interview-part="round-picker">{roundPicker}</div>
    </section>
    <section data-interview-part="notes-field">
    <div className={styles.reviewNotesHeader} data-interview-part="notes-heading">
      <label htmlFor="review-notes">面试记录</label>
      <VoiceControls showLabel value={notes} onChange={onChange} readText={notes} disabled={voiceDisabled} />
    </div>
    <textarea id="review-notes" value={notes} onChange={event => onChange(event.target.value)} rows={9}
      placeholder="写下或口述你记得的问题和回答：被追问了什么、哪题最没底、对方给了什么反馈…" />
    </section>
    <div className={styles.reviewActions} data-interview-part="review-actions">{children}</div>
  </div>;
}
