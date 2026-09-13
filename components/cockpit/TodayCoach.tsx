"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BellSimple,
  Briefcase,
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  CloudArrowUp,
  FolderSimple,
  Question,
} from "@phosphor-icons/react";
import type { Opportunity } from "@/lib/opportunities/types";
import { getTodayMentorPlan } from "@/lib/coach-harness/next-action";
import {learningGuide} from "@/lib/coach-harness/learning-guide";
import { TokenPayWidget } from "@/components/tokenpay/TokenPayWidget";
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
  onOpenPlans,
  onStartCoaching,
  learningRevision=0,
  notice,
}: {
  opportunities: Opportunity[];
  activeId: string;
  accountLabel: string;
  onSelect: (id: string) => void;
  onOpenTab: (tab: TodayTab) => void;
  onCreate: () => void;
  onSnooze: () => void;
  onFeedback: (input: { reason: "already_done" | "wrong_priority" | "missing_context"; opportunityId: string | null; actionId: string; sourceActionId?: string }) => void;
  onShowRules: () => void;
  /** 打开四类入口弹层（PRD §3.1）：入口关闭后可随时找回 */
  onOpenPlans?: () => void;
  onStartCoaching?: (title:string,prompt:string)=>void;
  learningRevision?:number;
  notice: string;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [guideOpen,setGuideOpen]=useState(false);
  const [savedProgress,setSavedProgress]=useState<{scope?:string;entry:{title:string;summary:string}|null}|null>(null);
  const active = opportunities.find((item) => item.id === activeId) ?? opportunities[0];
  const visibleOpportunities = opportunities.slice(0, 3);
  const now = new Date();
  const mentorPlan = getTodayMentorPlan(opportunities, now);
  const focusAction = mentorPlan.focus;
  const guide=learningGuide(focusAction);
  const focusOpportunity = opportunities.find((item) => item.id === focusAction?.opportunityId) ?? active;
  const progress=savedProgress?.scope===focusOpportunity?.id?savedProgress?.entry:null;
  useEffect(()=>{
    const controller=new AbortController();
    const id=focusOpportunity?.id;
    if(id&&!/^[0-9a-f-]{36}$/i.test(id))return;
    fetch("/api/coach/agent/sessions"+(id?"?opportunityId="+id:""),{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then(b=>{if(!controller.signal.aborted&&b.ok)setSavedProgress({scope:id,entry:b.sessions.find((s:{status:string;summary?:string})=>s.status==="archived"&&s.summary)||null});}).catch(()=>{});
    return()=>controller.abort();
  },[focusOpportunity?.id,learningRevision]);
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
            添加材料
          </button>
        </div>

        <div className={styles.account}>
          <TokenPayWidget />
          {onOpenPlans && (
            <button className={styles.helpButton} type="button" onClick={onOpenPlans}>我的计划</button>
          )}
          <button className={styles.helpButton} type="button" onClick={() => setGuideOpen(true)}>怎么用 <Question size={13} /></button>
          <span className={styles.accountMark}>{accountLabel.slice(0, 1).toUpperCase()}</span>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <nav className={styles.primaryNav} aria-label="主要功能">
            <button className={styles.navActive} type="button"><CalendarBlank size={23} />今日</button>
            <button type="button" onClick={() => onOpenTab("overview")}><Briefcase size={23} />岗位</button>
            <button type="button" onClick={() => onOpenTab("resume")}><FolderSimple size={23} />资料</button>
            <button type="button" onClick={() => onOpenTab("activity")}><ClockCounterClockwise size={23} />历史</button>
          </nav>
          <div className={styles.mobileTokenPay}><TokenPayWidget compact /></div>

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
              <h1>还没开始求职，也可以从这里开始。</h1>
              <p>先用一个小例子练习：找出用户的问题。你回答后，导师会带你改，不需要先准备简历或 JD。</p>
              <button type="button" onClick={()=>onStartCoaching?.("第一堂练习","我刚开始准备求职，没有简历和JD。请用一个日常产品的短例子教我区分用户问题和解决方案，然后给我一道题，等我作答后再反馈。")}>开始第一堂练习 <ArrowRight size={17} /></button>
              <button type="button" onClick={onCreate}>已有简历或岗位，直接导入</button>
            </div>
          ) : (
            <>
              <header className={styles.todayHeader}>
                <div>
                  <h1>今日 ToDo <b>{todayTodoCount}</b></h1>
                  <p>从最需要的一项开始，边聊边练。</p>
                </div>
                <time dateTime={dateTime}>{dateLabel}</time>
              </header>

              <article className={styles.learningFocus}>
                {guideOpen&&<p className={styles.learningCaution}>选一个当前目标 → 开始右侧辅导 → 回答并修改 → 结束时保存进展。已有材料可从左侧添加。<button type="button" onClick={onShowRules}>查看额度规则</button></p>}
                <h2>{progress?"接着上次没练完的地方":guide.title}</h2>
                <p className={styles.learningScope}>{focusOpportunity?.company} · {focusOpportunity?.role}</p>
                <p className={styles.learningReason}>{progress?progress.title:`${focusAction?.title||""}。${guide.reason}`}</p>
                <p className={styles.learningCaution}>材料没证明，不等于你不会。先一起确认，再决定是整理经历还是补一项能力。</p>
                <h3>具体怎么练</h3>
                <ol>{(progress?["从学习笔记中找回上次卡点","换一个例子，检验自己是否会用","根据你的回答调整下一步"]:guide.steps).map(step=><li key={step}>{step}</li>)}</ol>
                <details className={styles.learningExample}><summary>{progress?"查看上次学习笔记":"先看一个例子"}</summary><p>{progress?progress.summary:guide.example}</p></details>
                <button className={styles.primaryAction} type="button" onClick={()=>onStartCoaching?.(progress?"继续上次辅导":guide.title,progress?"请读取上次学习进展，从未解决的具体练习继续。先用一道迁移题检查我会不会，再根据回答调整教学。不把笔记里的判断当成已掌握。":guide.prompt)}>开始对话辅导 <ArrowRight size={16}/></button>
                <small>在右侧边学边练 · 使用 AI 对话额度</small>
                <div className={styles.softActions}>
                  <button type="button" onClick={()=>{if(focusAction?.opportunityId)onSelect(focusAction.opportunityId);onOpenTab(focusAction?.tab||"overview");}}>我会做，直接整理材料</button>
                  <button type="button" onClick={()=>onStartCoaching?.("从一个小练习开始","我没有做过相关项目。请结合当前岗位选一个可以现在开始的小练习，先解释要解决什么问题，再带我完成第一步。不要把练习当成工作经历。")}>我还没做过，带我从头练</button>
                  <button type="button" onClick={onSnooze}><BellSimple size={15}/>稍后</button>
                  <button type="button" onClick={()=>setFeedbackOpen(v=>!v)}><Question size={15}/>建议不适合</button>
                </div>
                {feedbackOpen&&<div className={styles.feedbackMenu}>
                  <button type="button" onClick={()=>{if(focusAction)onFeedback({reason:"already_done",opportunityId:focusAction.opportunityId,actionId:focusAction.id,sourceActionId:focusAction.sourceActionId});setFeedbackOpen(false);}}>已经做完</button>
                  <button type="button" onClick={()=>{if(focusAction)onFeedback({reason:"wrong_priority",opportunityId:focusAction.opportunityId,actionId:focusAction.id});setFeedbackOpen(false);}}>现在不优先</button>
                  <button type="button" onClick={()=>{if(focusAction)onFeedback({reason:"missing_context",opportunityId:focusAction.opportunityId,actionId:focusAction.id});setFeedbackOpen(false);}}>缺少我的背景</button>
                </div>}
              </article>

              <details className={styles.pastProgress}><summary>查看进度与历史</summary>
              <div className={styles.stageSummary}>
                <div>
                  <span><CheckCircle size={18} /></span>
                  <p><strong>{focusOpportunity?.stageLabel} · 已完成 {completedCount}/{actionCount}</strong><small>{focusAction ? "完成今日任务后，导师会自动重排下一步" : "当前行动已完成"}</small></p>
                </div>
                <button type="button" onClick={() => onOpenTab("overview")}>查看完整进度 <ArrowRight size={16} /></button>
              </div>

              <section className={styles.completedWork}>
                <header><h2>导师动态</h2><button type="button" onClick={() => onOpenTab("activity")}>查看全部</button></header>
                <div>
                  {(focusOpportunity?.activities.slice(0, 1) || []).map((activity) => <article key={activity.id}><CheckCircle size={21} /><p><strong>{activity.title}</strong><small>{activity.timeLabel}　<button onClick={() => onOpenTab("activity")}>查看记录</button></small></p></article>)}
                  {!focusOpportunity?.activities.length && <article><CalendarBlank size={21} /><p><strong>还没有导师动态</strong><small>添加材料后会在这里记录判断依据</small></p></article>}
                </div>
              </section>
              </details>
            </>
          )}
        </section>
      </div>
      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
