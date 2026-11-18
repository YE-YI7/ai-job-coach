"use client";

import { useState } from "react";
import { CockpitApp } from "./CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";
import styles from "./InterviewDetailPreview.module.css";
import type { Opportunity } from "@/lib/opportunities/types";

const readingExample = "你的两个知识助手项目都强调评测与失败恢复，但其中一个项目仍有真实使用效果待验证。"
  + "请具体讲一个你通过工程手段解决回答失控或成本过高的实例，说明你如何区分模型能力问题、工具故障和上下文缺失。"
  + "你当时如何定义问题、选择约束、设计对照，并验证这些约束真正有效？如果重新设计，你会改变什么？";

/** Existing dev route only. Same Cockpit instance stays mounted when comparing styles. */
export default function InterviewDetailPreview({ initialTab, initialPolished = true, initialProgressive = false,
  questionExample = false }: {
  initialTab: "interview" | "review";
  initialPolished?: boolean;
  initialProgressive?: boolean;
  questionExample?: boolean;
}) {
  const [polished, setPolished] = useState(initialPolished);
  const [progressive, setProgressive] = useState(initialProgressive);
  const opportunities: Opportunity[] = questionExample ? [{ ...demoOpportunities[0],
    mockInterviews: [{ id: "reading-layout-example", round: "一面", roundType: "业务面",
      status: "running", currentIndex: 0, createdAt: "2026-11-17T00:00:00Z",
      turns: [readingExample, "如果只能保留一个评测指标，你会选什么？", "请谈谈你最想改进的一次产品决策。"]
        .map((question, index) => ({ questionId: `reading-question-${index}`, question,
          rationale: "核对个人行动、判断依据与结果证据。这是虚构的本地排版样例，不代表真实面试。" })),
    }],
  }, ...demoOpportunities.slice(1)] : demoOpportunities;
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
      <CockpitApp initialOpportunities={opportunities} userEmail="interview-detail-preview@example.test"
        dataMode="demo" initialTab={initialTab} interviewDesign={polished ? "qoder" : "legacy"}
        progressiveInterviewSetup={progressive} />
    </div>
  </>;
}
