"use client";

import Image from "next/image";
import {
  ArrowRight,
  BellSimple,
  Briefcase,
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  CloudArrowUp,
  FileText,
  FolderSimple,
  Question,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { Opportunity } from "@/lib/opportunities/types";
import { getTodayMentorPlan } from "@/lib/coach-harness/next-action";
import styles from "./TodayCoach.module.css";

type TodayTab = "overview" | "evidence" | "resume" | "interview" | "review" | "activity";

function deadlineFor(opportunity: Opportunity, index: number) {
  if (opportunity.nextEventLabel) return opportunity.nextEventLabel;
  if (index === 0) return "等待导师安排";
  return opportunity.capturedAtLabel || "已收录";
}

function recommendationFor(opportunity: Opportunity, index: number) {
  if (index === 0) return "投递准备中";
  if (opportunity.stage === "applied") return "已投递";
  if (opportunity.stage === "interviewing") return "准备面试";
  return opportunity.stageLabel || "待评估";
}

export function TodayCoach({
  opportunities,
  activeId,
  accountLabel,
  onSelect,
  onOpenTab,
  onCreate,
  onSnooze,
  onFeedback,
  onShowRules,
  notice,
}: {
  opportunities: Opportunity[];
  activeId: string;
  accountLabel: string;
  onSelect: (id: string) => void;
  onOpenTab: (tab: TodayTab) => void;
  onCreate: () => void;
  onSnooze: () => void;
  onFeedback: () => void;
  onShowRules: () => void;
  notice: string;
}) {
  const active = opportunities.find((item) => item.id === activeId) ?? opportunities[0];
  const visibleOpportunities = opportunities.slice(0, 3);
  const now = new Date();
  const mentorPlan = getTodayMentorPlan(opportunities, now);
  const focusAction = mentorPlan.focus;
  const focusOpportunity = opportunities.find((item) => item.id === focusAction?.opportunityId) ?? active;
  const todayTodoCount = mentorPlan.todayCount;
  const completedCount = focusOpportunity?.actions.filter((action) => action.status === "done").length || 0;
  const actionCount = focusOpportunity?.actions.length || 0;
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now);
  const dateTime = now.toISOString().slice(0, 10);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Image src="/logo.png" alt="益职" width={48} height={48} priority />
          <strong>益职</strong>
        </div>

        <div className={styles.capture} aria-label="导入求职材料">
          <button className={styles.captureLead} type="button" onClick={onCreate}>
            <CloudArrowUp size={18} weight="regular" />
            添加岗位或材料
          </button>
          <span>文件、链接或文本</span>
        </div>

        <div className={styles.account}>
          <div>
            <strong>基础作战盘</strong>
            <span className={styles.quotaTrack}><i /></span>
            <button type="button" onClick={onShowRules}>生成前会说明额度 <Question size={13} /></button>
          </div>
          <span className={styles.accountMark}>{accountLabel.slice(0, 1).toUpperCase()}</span>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <nav className={styles.primaryNav} aria-label="主要功能">
            <button className={styles.navActive} type="button"><CalendarBlank size={23} />今日</button>
            <button type="button" onClick={() => onOpenTab("overview")}><Briefcase size={23} />机会</button>
            <button type="button" onClick={() => onOpenTab("resume")}><FolderSimple size={23} />材料</button>
            <button type="button" onClick={() => onOpenTab("activity")}><ClockCounterClockwise size={23} />记录</button>
          </nav>

          <div className={styles.opportunityRail}>
            <div className={styles.railTitle}>正在推进 <span>({visibleOpportunities.length})</span></div>
            {visibleOpportunities.map((opportunity, index) => (
              <button
                key={opportunity.id}
                className={opportunity.id === active?.id ? styles.opportunityActive : undefined}
                type="button"
                onClick={() => onSelect(opportunity.id)}
              >
                <span className={styles.opportunityIcon}><Briefcase size={21} weight="duotone" /></span>
                <span>
                  <small>{opportunity.company}</small>
                  <strong>{opportunity.role}</strong>
                  <em>{recommendationFor(opportunity, index)} · {deadlineFor(opportunity, index)}</em>
                </span>
              </button>
            ))}
          </div>

          <time className={styles.todayDate} dateTime={dateTime}>{dateLabel}</time>
        </aside>

        <section className={styles.document}>
          {!active ? (
            <div className={styles.emptyState}>
              <span>导师建议</span>
              <h1>先把你手头的一份材料交给我。</h1>
              <p>简历、岗位链接、经历材料或求职目标任选一个。你不用整理格式，我会先判断从哪一步开始。</p>
              <button type="button" onClick={onCreate}>交一份现有材料 <ArrowRight size={17} /></button>
            </div>
          ) : (
            <>
              <header className={styles.todayHeader}>
                <div>
                  <h1>今日 ToDo <b>{todayTodoCount}</b></h1>
                  <time dateTime={dateTime}>{dateLabel}</time>
                </div>
              </header>

              <article className={styles.focusTask}>
                <div className={styles.taskLayout}>
                  <div className={styles.taskCopy}>
                    <div className={styles.taskContext}>
                      <span>{focusOpportunity?.company} · {focusOpportunity?.role}</span>
                    </div>
                    <h2>{focusAction?.title || "等待你确认下一步"}</h2>
                    <p>{focusAction?.reason || focusOpportunity?.recommendationReason}</p>

                    <div className={styles.sourceTrace}>
                      <ShieldCheck size={19} weight="duotone" />
                      <div><strong>导师比较了全部机会后，把最影响结果的一步放到今天</strong><span>{focusOpportunity?.requirements.length || 0} 项岗位要求 · {focusOpportunity?.activities.length || 0} 条历史记录 · {focusAction?.cost === "free" ? "免费动作" : "执行前显示额度"}</span></div>
                      <button type="button" onClick={() => { if (focusAction?.opportunityId) onSelect(focusAction.opportunityId); onOpenTab("overview"); }}>查看判断</button>
                    </div>
                  </div>

                  <aside className={styles.coachAction}>
                    <div className={styles.mentorConversation}>
                      <div className={styles.mentorAvatar} aria-hidden="true">
                  <Image src="/mentor-mascot-v2.png" alt="" width={108} height={108} />
                      </div>
                      <div className={styles.mentorBubble}>
                        <span>导师建议</span>
                        <p>{focusAction ? `先完成“${focusAction.title}”。完成后，我会重新比较全部岗位，再安排下一步。` : "当前没有待办。岗位出现变化后，我会重新检查。"}</p>
                      </div>
                    </div>
                    <button className={styles.primaryAction} type="button" onClick={() => { if (focusAction?.opportunityId) onSelect(focusAction.opportunityId); onOpenTab(focusAction?.tab || "overview"); }}>{focusAction ? "开始处理" : "查看岗位"} <ArrowRight size={16} /></button>
                    <button className={styles.secondaryAction} type="button" onClick={() => { if (focusAction?.opportunityId) onSelect(focusAction.opportunityId); onOpenTab("evidence"); }}><FileText size={16} />只检查事实（免费）</button>
                    <small>{focusAction?.dueLabel || "无截止时间"}　·　{focusAction?.cost === "credits" ? "执行前显示额度" : "这一步免费"}</small>
                    <div className={styles.softActions}>
                      <button type="button" onClick={onSnooze}><BellSimple size={15} />稍后提醒</button>
                      <button type="button" onClick={onFeedback}><Question size={15} />不适合我</button>
                    </div>
                  </aside>
                </div>
              </article>

              <div className={styles.stageSummary}>
                <div>
                  <span><CheckCircle size={18} /></span>
                  <p><strong>{focusOpportunity?.stageLabel} · {completedCount}/{actionCount}</strong><small>{focusAction ? `下一步：${focusAction.title}` : "当前行动已完成"}</small></p>
                </div>
                <button type="button" onClick={() => onOpenTab("overview")}>查看完整进度 <ArrowRight size={16} /></button>
              </div>

              <section className={styles.completedWork}>
                <header><h2>导师动态</h2><button type="button" onClick={() => onOpenTab("activity")}>查看全部</button></header>
                <div>
                  {(focusOpportunity?.activities.slice(0, 2) || []).map((activity) => <article key={activity.id}><CheckCircle size={21} /><p><strong>{activity.title}</strong><small>{activity.timeLabel}　<button onClick={() => onOpenTab("activity")}>查看记录</button></small></p></article>)}
                  {!focusOpportunity?.activities.length && <article><CalendarBlank size={21} /><p><strong>还没有导师动态</strong><small>添加材料后会在这里记录判断依据</small></p></article>}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
