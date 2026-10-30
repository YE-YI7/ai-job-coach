"use client";

import { useState } from "react";
import InterviewRoundReview from "./InterviewRoundReview";
import InterviewHistory from "./InterviewRecords";
import {
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  type RoundtableTurnView,
} from "./interview-assessment-logic";
import { historyFromRecord } from "@/lib/interview/history";
import type { InterviewRoundtableSession } from "@/lib/opportunities/types";

const turns: RoundtableTurnView[] = [
  {
    questionId: "fixture-question-1",
    question: "怎样确定灰度试验的对照基线？",
    answer:
      "我先核对灰度前的失败记录，再固定对照样本，保留来源和同一条判断标准。",
    assessment: normalizeInterviewAssessment(
      {
        status: "assessed",
        score: 72,
        summary: "已经讲清判断依据，还需要补齐对照口径。",
        evidence: ["核对灰度前的失败记录"],
        missingEvidence: ["对照样本如何选择"],
        rewritePlan: ["先说基线口径，再讲自己的判断。"],
        followUp: "你怎样选择灰度样本？",
      },
      "demo",
    )!,
  },
  {
    questionId: "fixture-question-2",
    question: "怎样选择灰度样本？",
    answer: "[已跳过，未评分] 本轮跳过",
    skipped: true,
  },
  {
    questionId: "fixture-question-3",
    question: "协作时如何保留失败证据？",
    answer: "我把被退回的修改连同原文放进记录，下一轮重测时仍用同一份材料。",
  },
];
const summary = normalizeRoundSummary({
  overallScore: 72,
  grade: "继续练习",
  verdict: "判断与行动已经连起来；下一轮先把对照口径讲清楚。",
  strengths: ["保留了失败证据"],
  weaknesses: ["对照口径还不够清楚"],
  dimensions: [
    {
      name: "判断与验证",
      score: 72,
      comment: "说明了依据与行动，还缺样本选择。",
    },
  ],
  questionBreakdown: [
    {
      questionId: "fixture-question-1",
      score: 72,
      decisiveFinding: "补齐样本选择口径。",
    },
  ],
  nextActions: [
    {
      title: "说明对照样本的选择",
      reason: "让前后比较可解释",
      doneWhen: "能讲清样本和同一标准",
      priority: "high",
    },
  ],
})!;
const sessions = Array.from({ length: 12 }, (_, index) =>
  historyFromRecord({
    id: `fixture-interview-${index}`,
    opportunityId: "fixture-opportunity",
    round: index % 2 ? "二面" : "一面",
    roundType: "产品业务面",
    createdAt: new Date(
      Date.UTC(2026, 9, 20 + Math.floor(index / 2), 8, index),
    ).toISOString(),
    status: "completed",
    currentIndex: 2,
    turns,
    summary,
  } as unknown as InterviewRoundtableSession),
).map((session, index) => ({
  ...session,
  jobLabel: index % 2 ? "虚构知识平台 · 产品经理" : "虚构协作工具 · 产品经理",
}));

/** 仅由development预览入口引用；所有材料虚构，无模型、短信、付款或云写入。 */
export default function InterviewUiFixture({ initialHistory = false }: { initialHistory?: boolean }) {
  const [view, setView] = useState<"result" | "history">(initialHistory ? "history" : "result");
  const closeHistory = () => {
    const url = new URL(window.location.href);
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith("interview") && key !== "interviewUI")
        url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    setView("result");
  };
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px clamp(20px, 4vw, 40px)",
      }}
    >
      <p>虚构前端验收材料 · 不调用模型、不写账号数据</p>
      {view === "result" ? (
        <InterviewRoundReview
          summary={summary}
          turns={turns}
          round="二面"
          createdAt="2026-10-30T08:00:00Z"
          example
          onOpenHistory={() => setView("history")}
          onBack={() => setView("history")}
          onRestart={() => setView("history")}
          selfReflection={{
            questions: ["下一轮先补什么？"],
            answers: ["先把样本选择口径说明白。"],
          }}
        />
      ) : (
        <InterviewHistory
          opportunityId="fixture-opportunity"
          demoSessions={sessions}
          onClose={closeHistory}
          onResume={closeHistory}
        />
      )}
    </main>
  );
}
