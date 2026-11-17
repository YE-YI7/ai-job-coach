"use client";

import { Fragment, useId, useState } from "react";
import { ArrowRight, CheckCheck, Clock3 } from "lucide-react";
import type { TodayTask } from "@/lib/coach-harness/today-view";
import styles from "./TodayTaskList.module.css";

type Receipt = { task: TodayTask; index: number; action: "complete" | "snooze" };

/** Presentation only: existing callbacks still own navigation, task changes and persistence. */
export default function TodayTaskList({ tasks, onOpen, onSnooze, onComplete }: {
  tasks: TodayTask[];
  onOpen: (task: TodayTask) => void;
  onSnooze: (task: TodayTask) => void;
  onComplete: (task: TodayTask) => void;
}) {
  const id = useId();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const record = (task: TodayTask, index: number, action: Receipt["action"]) => {
    // Call first: a thrown callback must not produce a success-looking local receipt.
    if (action === "complete") onComplete(task);
    else onSnooze(task);
    setReceipt({ task, index, action });
  };
  const receiptPosition = receipt ? Math.min(receipt.index, tasks.length) : -1;
  const feedback = receipt && (
    <div key={`${receipt.task.id}-${receipt.action}`} className={styles.feedback}
      role="status" aria-live="polite" aria-atomic="true" aria-label="任务操作反馈">
      {receipt.action === "complete"
        ? <CheckCheck size={16} strokeWidth={1.7} aria-hidden="true" />
        : <Clock3 size={16} strokeWidth={1.7} aria-hidden="true" />}
      <div>
        <span className={styles.feedbackTitle}>{receipt.task.title}</span>
        <p>{receipt.action === "complete"
          ? "当前页面已标记做过（自报），不代表能力已确认。"
          : "当前页面已放到明天再看，任务没有删除。"}</p>
      </div>
    </div>
  );

  return <div className={styles.list}>
    {tasks.map((task, index) => <Fragment key={task.id}>
      {receiptPosition === index && feedback}
      <article className={styles.task} data-task={task.target} data-primary={index === 0 || undefined}
        aria-labelledby={`${id}-${index}`}>
        <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div className={styles.content}>
          <header className={styles.header}>
            <span className={styles.phase}>{index === 0 ? "现在" : index === 1 ? "接着" : "然后"}</span>
            {task.dueLabel && <span>{task.dueLabel}</span>}
          </header>
          <h3 id={`${id}-${index}`}>{task.title}</h3>
          <p className={styles.reason}>{task.why}</p>
          <p className={styles.effort}>
            <Clock3 size={13} strokeWidth={1.6} aria-hidden="true" />
            {task.effort ? `建议投入 ${task.effort}` : "时长按你手上的材料再定"}
          </p>
          <div className={styles.actions} role="group" aria-label={`${task.title}的操作`}>
            <button type="button" className={styles.go} onClick={() => onOpen(task)}>
              <span>{task.target === "arrangement" ? "去安排里继续" : "去做"}</span>
              <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {((task.target === "tab" && task.opportunityId) || task.sourceActionId) && (
              <div className={styles.secondary}>
                {task.target === "tab" && task.opportunityId && (
                  <button type="button" className={styles.quiet} onClick={() => record(task, index, "snooze")}>
                    <Clock3 size={15} strokeWidth={1.65} aria-hidden="true" /><span>明天再看</span>
                  </button>
                )}
                {task.sourceActionId && (
                  <button type="button" className={styles.quiet} onClick={() => record(task, index, "complete")}>
                    <CheckCheck size={16} strokeWidth={1.7} aria-hidden="true" /><span>标记做过</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    </Fragment>)}
    {receiptPosition === tasks.length && feedback}
  </div>;
}
