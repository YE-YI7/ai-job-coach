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
 const verified=opportunity.requirements.filter(r=>r.verified&&r.strength==="strong").length;
 const saved:Record<string,string>={overview:verified?`${verified} 条已核验依据`:"",resume:frozen?`版本 V${frozen.version}`:"",interview:opportunity.interviewPractices?.length?`${opportunity.interviewPractices.length} 次已存反馈`:"",review:opportunity.reviewReports?.length?`${opportunity.reviewReports.length} 份已存复盘`:""};
 return <div className={styles.timeline}>
  <header className={styles.identity}><h1>{opportunity.role}</h1><div><span>{opportunity.company}</span><span className={styles.stageLabel}>{journeyStages.find(s=>s.id===current)?.label}中</span>{opportunity.location&&<span>{opportunity.location}</span>}</div></header>
  <ol aria-label="岗位时间线" title="自由浏览不会改变实际进度；完成状态以保存的材料、版本和记录为准。">{journeyStages.map((s,i)=><li key={s.id}><button onClick={()=>onSelect(s.id)} aria-current={selected===s.id?"step":undefined}><span className={styles.node}>{i+1}</span><strong>{s.label}</strong><small>{saved[s.id]||(s.id===current?"当前阶段":s.id==="review"?"与面试并行":"浏览阶段")}</small></button></li>)}</ol>
  {selected!==current&&<div className={styles.current}><button className={styles.returnButton} onClick={()=>onSelect(current)}><ArrowLeft size={14}/>回到当前阶段</button></div>}
 </div>;
}
