"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, BriefcaseBusiness, FileText, History, Layers, Mic, Plus } from "lucide-react";
import type { Opportunity } from "@/lib/opportunities/types";
import { buildTodayView, type TodayCompanionSummary, type TodayTask, type TodayTab } from "@/lib/coach-harness/today-view";
import { resolveUserTimeZone } from "@/lib/coach-harness/today-progress";
import CurrentArrangement from "./CurrentArrangement";
import { useTodayCompanion } from "./useTodayCompanion";
import styles from "./TodayWorkspace.module.css";

const SERVER_TIME_ZONE = "Asia/Shanghai";
const subscribeTimeZone = () => () => {};
const readClientTimeZone = () => resolveUserTimeZone();
const readServerTimeZone = () => SERVER_TIME_ZONE;

export default function TodayWorkspace({
  opportunities,
  activeId,
  live,
  demo = false,
  saveState,
  initialCompanion = null,
  onOpenTab,
  onOpenResume,
  onOpenInterview,
  onAddMaterial,
  onSnoozeTask,
  onCompleteTask,
  onRetrySave,
  onAskMentor,
}: {
  opportunities: Opportunity[];
  activeId: string;
  live: boolean;
  demo?: boolean;
  saveState?: "saving" | "saved" | "failed" | null;
  initialCompanion?: TodayCompanionSummary | null;
  onOpenTab: (tab: TodayTab, opportunityId?: string | null) => void;
  onOpenResume: (opportunityId?: string | null) => void;
  onOpenInterview: (opportunityId?: string | null) => void;
  onAddMaterial: () => void;
  onSnoozeTask: (task: TodayTask) => void;
  onCompleteTask: (task: TodayTask) => void;
  onRetrySave: () => void;
  onAskMentor: (prompt: string, attemptId: string, opportunityId?: string | null) => void;
}) {
  const timeZone = useSyncExternalStore(subscribeTimeZone, readClientTimeZone, readServerTimeZone);
  const [companionRevision, setCompanionRevision] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDetailsElement | null>(null);
  const arrangementRef = useRef<HTMLDivElement | null>(null);

  const activeScopeId = opportunities.find(item => item.id === activeId)?.id || opportunities[0]?.id || null;
  const result = useTodayCompanion({
    scope: activeScopeId || "none", enabled: live, revision: companionRevision,
    fallback: true, initialCompanion,
  });

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ planId?: string }>).detail;
      if (detail?.planId) setCompanionRevision((value) => value + 1);
    };
    window.addEventListener("yizhi-companion-updated", refresh);
    return () => window.removeEventListener("yizhi-companion-updated", refresh);
  }, []);

  // Companion plans only exist in live mode; keep a stale read out of demo/offline views.
  const visibleCompanion = live ? result.companion : null;
  const visibleCompanionScope = live ? result.scope : null;
  const view = buildTodayView({
    opportunities,
    activeId,
    timeZone,
    companion: visibleCompanion,
    companionOpportunityId: visibleCompanionScope === "none" ? null : visibleCompanionScope,
  });
  const scopeId = activeScopeId;
  const arrangementScopeId = visibleCompanionScope === "none" ? null : visibleCompanionScope ?? scopeId;

  const openTask = (task: TodayTask) => {
    if (task.target === "arrangement") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      arrangementRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      arrangementRef.current?.focus({ preventScroll: true });
      return;
    }
    onOpenTab(task.tab || "overview", task.opportunityId);
  };

  const openHistory = () => {
    setHistoryOpen(true);
    window.requestAnimationFrame(() => {
      historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      historyRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div className={styles.today}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{view.greeting} · {view.dateLabel}</p>
        <h1>{view.goalTitle || "今天"}</h1>
        {view.goalNote && <p className={styles.goalNote}>{view.goalNote}</p>}
      </header>

      {demo && <p className={styles.demoNote}>示例工作区：任务和进度只用于体验，刷新后会恢复。</p>}

      <section className={styles.mentorNote} aria-label="导师留言">
        <Image className={styles.mentorMark} src="/first-light/D-mentor/mentor-wave.webp" alt="" width={58} height={58} />
        <p>{view.mentorLine}</p>
      </section>

      {saveState === "failed" && (
        <div className={styles.saveAlert} role="alert">
          <p>当前改动还没保存到云端，页面里的内容仍在。</p>
          <button type="button" onClick={onRetrySave}>重试保存</button>
        </div>
      )}

      <section className={styles.tasks} aria-label="今天要做的事">
        <header className={styles.sectionHead}>
          <h2>今天</h2>
          <span>{view.tasks.length ? `${view.tasks.length} 件 · 先做第一件` : "不新增任务"}</span>
        </header>
        {view.tasks.map((task, index) => (
          <article key={task.id} className={`${styles.task} ${index === 0 ? styles.taskPrimary : ""}`} data-task={task.target}>
            <span className={styles.taskIndex} aria-hidden="true">{index + 1}</span>
            <div className={styles.taskBody}>
              <span className={styles.taskPhase}>{index === 0 ? "现在" : index === 1 ? "接着" : "然后"}</span>
              <h3>{task.title}</h3>
              <p className={styles.taskWhy}>{task.why}</p>
              <p className={styles.taskMeta}>
                {task.dueLabel && <span>{task.dueLabel}</span>}
                {task.effort && <span>建议投入 {task.effort}</span>}
                {!task.effort && <span>时长按你手上的材料再定</span>}
              </p>
            </div>
            <div className={styles.taskActions}>
              <button type="button" className={styles.taskGo} onClick={() => openTask(task)}>
                {task.target === "arrangement" ? "去安排里继续" : "去做"}<ArrowRight size={15} />
              </button>
              {task.target === "tab" && task.opportunityId && <button type="button" className={styles.taskQuiet} onClick={() => onSnoozeTask(task)}>明天再看</button>}
              {task.sourceActionId && <button type="button" className={styles.taskQuiet} onClick={() => onCompleteTask(task)}>标记做过</button>}
            </div>
          </article>
        ))}
        {view.emptyLine && <p className={styles.emptyLine}>{view.emptyLine}</p>}
      </section>

      {live && (
        <div ref={arrangementRef} tabIndex={-1} className={styles.arrangement} aria-label="当前安排">
          {result.status === "error" && (
            <div className={styles.inlineError} role="status">
              <p>安排暂时没有读回来，其他内容不受影响。</p>
              <button type="button" onClick={() => setCompanionRevision((value) => value + 1)}>重新读取</button>
            </div>
          )}
          {visibleCompanionScope !== null && <CurrentArrangement
            key={visibleCompanionScope}
            hideWhenEmpty
            opportunityId={arrangementScopeId}
            onAskMentor={(prompt, attemptId) => onAskMentor(prompt, attemptId, arrangementScopeId)}
            onOpenResume={() => onOpenResume(scopeId)}
            onOpenInterview={() => onOpenInterview(scopeId)}
          />}
        </div>
      )}

      <details
        ref={historyRef}
        className={styles.history}
        open={historyOpen}
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary>
          <span>回看 · 本周真实推进</span>
          <span>{view.weekly.length} 项已确认</span>
        </summary>
        <div className={styles.historyBody}>
          {view.weekly.map((item) => (
            <button key={item.id} type="button" className={styles.progressRow} onClick={() => onOpenTab(item.tab, item.opportunityId)}>
              <span className={styles.progressTitle}>{item.title}</span>
              <span className={styles.progressMeta}>{item.company} · {item.sourceLabel} · {item.timeLabel} · {item.statusLabel}</span>
            </button>
          ))}
          {!view.weekly.length && <p className={styles.historyEmpty}>本周还没有已确认的产物。点“标记做过”不会算到这里。</p>}
          {view.latest && view.latest.dateKey < view.week.startKey && (
            <button type="button" className={styles.progressRow} onClick={() => onOpenTab(view.latest!.tab, view.latest!.opportunityId)}>
              <span className={styles.progressTitle}>最近一次：{view.latest.title}</span>
              <span className={styles.progressMeta}>{view.latest.company} · {view.latest.timeLabel} · {view.latest.statusLabel}</span>
            </button>
          )}
          <p className={styles.historyNote}>只统计已冻结或已出报告的产物，不按点击次数计分。</p>
        </div>
      </details>

      <nav className={styles.tools} aria-label="工具入口">
        <button type="button" onClick={() => onOpenTab("overview", scopeId)}><BriefcaseBusiness size={17} />岗位</button>
        <button type="button" onClick={() => onOpenResume(scopeId)}><FileText size={17} />简历</button>
        <button type="button" onClick={() => onOpenInterview(scopeId)}><Mic size={17} />面试</button>
        <button type="button" onClick={() => onOpenTab("evidence", scopeId)}><Layers size={17} />资料</button>
        <button type="button" onClick={openHistory}><History size={17} />历史</button>
        <button type="button" className={styles.addMaterial} onClick={onAddMaterial}><Plus size={17} />添加材料</button>
      </nav>
    </div>
  );
}
