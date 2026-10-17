"use client";
import type {Opportunity} from "@/lib/opportunities/types";
import {journeyStages,currentJourneyStage,resumeGate,type JourneyStage} from "@/lib/opportunities/timeline";
import styles from "./JobTimeline.module.css";
import {ArrowLeft, ChevronDown} from "lucide-react";
/**
 * 岗位时间线只负责「在哪一步、能不能跳过去看」。
 * 投递质检与冻结的唯一入口在「简历修改」页（单一进度条+按状态动作），
 * 这里以前重复的 gate 状态块和冻结按钮已移除，避免一条流程三个地方各喊一遍。
 */
export default function JobTimeline({opportunity,selected,onSelect}:{opportunity:Opportunity;selected:string;onSelect:(stage:JourneyStage)=>void}){
 const current=currentJourneyStage(opportunity),frozen=resumeGate(opportunity).frozen;
 const verified=opportunity.requirements.filter(r=>r.verified&&r.strength==="strong").length;
 const saved:Record<string,string>={overview:verified?`${verified} 条已核验依据`:"",resume:frozen?`版本 V${frozen.version}`:"",interview:opportunity.interviewPractices?.length?`${opportunity.interviewPractices.length} 次已存反馈`:"",review:opportunity.reviewReports?.length?`${opportunity.reviewReports.length} 份已存复盘`:""};
 if(selected==='resume')return <div className={`${styles.timeline} ${styles.resumeContext}`}>
  <div className={styles.resumeIdentity}><span>{opportunity.company}</span><span aria-hidden="true">/</span><h1>{opportunity.role}</h1></div>
  <label className={styles.stageSelect}><span>简历修改</span><ChevronDown size={13} aria-hidden="true"/><select aria-label="切换准备阶段" value={selected} onChange={event=>onSelect(event.target.value as JourneyStage)}>{journeyStages.map(stage=><option key={stage.id} value={stage.id}>{stage.label}{saved[stage.id]?` · ${saved[stage.id]}`:''}</option>)}</select></label>
  {selected!==current&&<button className={styles.returnButton} onClick={()=>onSelect(current)}>回到当前阶段<ArrowLeft size={13}/></button>}
 </div>;
 return <div className={`${styles.timeline} ${selected === "resume" ? styles.compact : ""}`}>
  <header className={styles.identity}><h1>{opportunity.role}</h1><div><span>{opportunity.company}</span><span className={styles.stageLabel}>{journeyStages.find(s=>s.id===current)?.label}中</span>{opportunity.location&&<span>{opportunity.location}</span>}</div></header>
  <ol aria-label="岗位时间线">{journeyStages.map(s=><li key={s.id}><button onClick={()=>onSelect(s.id)} title={saved[s.id]?`${s.label} · ${saved[s.id]}`:s.label} aria-current={selected===s.id?"step":undefined}><strong>{s.label}</strong><span className="sr-only">{saved[s.id]}</span></button></li>)}</ol>
  {selected!==current&&<div className={styles.current}><button className={styles.returnButton} onClick={()=>onSelect(current)}><ArrowLeft size={13}/>回到当前：{journeyStages.find(s=>s.id===current)?.label}</button></div>}
 </div>;
}
