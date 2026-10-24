"use client";
import type {Opportunity} from "@/lib/opportunities/types";
import {journeyStages,currentJourneyStage,resumeGate,type JourneyStage} from "@/lib/opportunities/timeline";
import styles from "./JobTimeline.module.css";
import {ArrowLeft} from "lucide-react";
/**
 * 岗位时间线只负责「在哪一步、能不能跳过去看」。
 * 投递质检与冻结的唯一入口在「简历修改」页（单一进度条+按状态动作），
 * 这里以前重复的 gate 状态块和冻结按钮已移除，避免一条流程三个地方各喊一遍。
 */
export default function JobTimeline({opportunity,selected,onSelect}:{opportunity:Opportunity;selected:string;onSelect:(stage:JourneyStage)=>void}){
 const current=currentJourneyStage(opportunity),frozen=resumeGate(opportunity).frozen;
 const currentLabel=journeyStages.find(s=>s.id===current)?.label;
 const verified=opportunity.requirements.filter(r=>r.verified&&r.strength==="strong").length;
 const saved:Record<string,string>={overview:verified?`${verified} 条已核验依据`:"",resume:frozen?`版本 V${frozen.version}`:"",interview:opportunity.interviewPractices?.length?`${opportunity.interviewPractices.length} 次已存反馈`:"",review:opportunity.reviewReports?.length?`${opportunity.reviewReports.length} 份已存复盘`:""};
 if(selected==='resume')return <div className={`${styles.timeline} ${styles.resumeContext}`} data-tour="stages">
  <div className={styles.resumeIdentity}><span>{opportunity.company}</span><span aria-hidden="true">/</span><h1>{opportunity.role}</h1></div>
  <nav className={styles.stageLine} aria-label="切换准备阶段"><ol>{journeyStages.map(stage=><li key={stage.id}><button type="button" onClick={()=>onSelect(stage.id)} title={saved[stage.id]?`${stage.label} · ${saved[stage.id]}`:stage.label} aria-current={selected===stage.id?"step":undefined}>{stage.label}</button></li>)}</ol></nav>
  {selected!==current&&<button className={styles.returnButton} onClick={()=>onSelect(current)}>回到当前阶段<ArrowLeft size={13}/></button>}
 </div>;
 return <div className={styles.timeline} data-tour="stages">
  <div className={styles.timelineHead}>
   <header className={styles.identity}><h1>{opportunity.role}</h1><div><span>{opportunity.company}</span><span className={styles.stageLabel}>{currentLabel}中</span>{opportunity.location&&<span>{opportunity.location}</span>}</div></header>
   {selected!==current&&<button className={styles.returnButton} onClick={()=>onSelect(current)}><ArrowLeft size={13}/>回到当前：{currentLabel}</button>}
  </div>
  <ol aria-label="岗位时间线">{journeyStages.map(s=><li key={s.id}><button onClick={()=>onSelect(s.id)} title={saved[s.id]?`${s.label} · ${saved[s.id]}`:s.label} aria-current={selected===s.id?"step":undefined}><strong>{s.label}</strong><span className="sr-only">{saved[s.id]}</span></button></li>)}</ol>
 </div>;
}
