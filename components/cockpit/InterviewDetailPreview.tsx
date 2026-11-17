"use client";

import { useState } from "react";
import { CockpitApp } from "./CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";
import styles from "./InterviewDetailPreview.module.css";

/** Existing dev route only. Same Cockpit instance stays mounted when comparing styles. */
export default function InterviewDetailPreview({ initialTab, initialPolished = true, initialProgressive = false }: {
  initialTab: "interview" | "review";
  initialPolished?: boolean;
  initialProgressive?: boolean;
}) {
  const [polished, setPolished] = useState(initialPolished);
  const [progressive, setProgressive] = useState(initialProgressive);
  return <>
    <div className={styles.controls} role="group" aria-label="面试中列样式对照">
      {initialProgressive ? <>
        <button type="button" aria-pressed={progressive} onClick={() => setProgressive(true)}>逐步设置</button>
        <button type="button" aria-pressed={!progressive} onClick={() => setProgressive(false)}>当前线上</button>
      </> : <>
        <button type="button" aria-pressed={polished} onClick={() => setPolished(true)}>Qoder 中列</button>
        <button type="button" aria-pressed={!polished} onClick={() => setPolished(false)}>原样对照</button>
      </>}
      <span>本地示例 · 未上线</span>
    </div>
    <div>
      <CockpitApp initialOpportunities={demoOpportunities} userEmail="interview-detail-preview@example.test"
        dataMode="demo" initialTab={initialTab} interviewDesign={polished ? "qoder" : "legacy"}
        progressiveInterviewSetup={progressive} />
    </div>
  </>;
}
