"use client";
import { useState } from "react";
import ResumeInlineReview from "./ResumeInlineReview";
import ResumeAgentConversation from "./ResumeAgentConversation";
import { ResumeReferenceProvider } from "./ResumeReference";
import { demoOpportunities } from "@/lib/opportunities/demo";
import { resolveResumeReference } from "@/lib/opportunities/resume-reference";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import styles from "./ResumeReferenceFixture.module.css";

const source =
  "林验收（虚构材料）\n\n## 项目经历\n### 协作工具\n- 整理需求记录，交给产品经理每周核对。\n- 保留原始记录，核对每一次修改。";
const before = "整理需求记录，交给产品经理每周核对。";
const makeOpportunity = (id: string) => ({
  ...demoOpportunities[0],
  id,
  resumeRevision: "quote-fixture-r1",
  resumeText: source,
  resumeChanges: [
    {
      id: "quote-fixture-change",
      before,
      after: "整理需求记录，供产品经理每周核对。",
      section: "项目经历 · 协作工具",
      reason: "仅精简重复表达；这是虚构验收材料。",
      evidenceId: null,
      status: "pending" as const,
    },
  ],
});
export default function ResumeReferenceFixture() {
  const [job, setJob] = useState("quote-fixture-job-a");
  const [owner, setOwner] = useState("虚构账号A");
  const [opportunity, setOpportunity] = useState(() => makeOpportunity(job));
  const [task, setTask] = useState<ResumeAgentTask>({
    id: `${owner}:${job}`,
    state: "ready",
    question: null,
    answers: [],
    updatedAt: "2026-10-30T00:00:00Z",
  });
  const [fail, setFail] = useState(false),
    [sent, setSent] = useState(0),
    [coordinates, setCoordinates] = useState("尚未发送");
  const switchScope = (nextOwner: string, nextJob: string) => {
    setOwner(nextOwner);
    setJob(nextJob);
    setOpportunity(makeOpportunity(nextJob));
    setTask({
      id: `${nextOwner}:${nextJob}`,
      state: "ready",
      question: null,
      answers: [],
      updatedAt: "2026-10-30T00:00:00Z",
    });
  };
  return (
    <main className={styles.fixture}>
      <p>虚构引用验收 · 不调用模型、不写云端账号数据</p>
      <nav aria-label="虚构验收控制">
        <button
          onClick={() =>
            switchScope(owner === "虚构账号A" ? "虚构账号B" : "虚构账号A", job)
          }
        >
          切换虚构账号
        </button>
        <button
          onClick={() =>
            switchScope(
              owner,
              job.endsWith("a") ? "quote-fixture-job-b" : "quote-fixture-job-a",
            )
          }
        >
          切换虚构岗位
        </button>
        <button
          onClick={() =>
            setOpportunity((value) => ({
              ...value,
              resumeText: `${value.resumeText}\n新增的虚构内容。`,
            }))
          }
        >
          模拟简历已更新
        </button>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => setFail(e.target.checked)}
          />
          模拟发送失败
        </label>
      </nav>
      <p role="status">
        {owner} · {job.endsWith("a") ? "岗位A" : "岗位B"} · 用户提交 {sent} 次 ·
        模型调用 0 次
      </p>
      <ResumeReferenceProvider source={opportunity} owner={owner}>
        <div className={styles.panes}>
          <ResumeInlineReview
            opportunity={opportunity}
            onUpdate={() => {}}
            onEdit={() => {}}
            onReorder={() => {}}
          />
          <aside aria-label="虚构简历导师">
            <ResumeAgentConversation
              key={task.id}
              task={task}
              busy={false}
              onMessage={async (
                message,
                requestId,
                onReply,
                onReceipt,
                _mode,
                reference,
              ) => {
                setSent((count) => count + 1);
                if (fail)
                  throw Error("虚构发送失败：草稿和引用保留，不调用模型。");
                const resolved = reference
                  ? await resolveResumeReference(reference, opportunity)
                  : undefined;
                setCoordinates(
                  resolved
                    ? `精确源区间 [${resolved.start}, ${resolved.end})；原文一致：${source.includes(resolved.before)}`
                    : "没有引用",
                );
                const reply =
                  "虚构验收反馈：已收到这处引用；这不是模型生成的回复。";
                onReply?.(reply);
                const next: ResumeAgentTask = {
                  ...task,
                  conversation: [
                    ...(task.conversation || []),
                    {
                      id: requestId,
                      message,
                      reply,
                      status: "completed",
                      decision: "discuss",
                      savedAt: new Date().toISOString(),
                      ...(resolved ? { resumeReference: resolved } : {}),
                    },
                  ],
                };
                setTask(next);
                onReceipt?.(next);
              }}
              onContinue={async () => {}}
              onSkip={async () => {}}
            />
            <p role="status">{coordinates}</p>
          </aside>
        </div>
      </ResumeReferenceProvider>
    </main>
  );
}
