"use client";
import type {Opportunity} from "@/lib/opportunities/types";
import {journeyStages,currentJourneyStage,resumeGate,type JourneyStage} from "@/lib/opportunities/timeline";
import styles from "./JobTimeline.module.css";
import {ArrowLeft,LockKeyhole,ShieldCheck} from "lucide-react";
export default function JobTimeline({opportunity,selected,onSelect,onFreeze,freezing}:{opportunity:Opportunity;selected:string;onSelect:(stage:JourneyStage)=>void;onFreeze:()=>void;freezing:boolean}){
 const current=currentJourneyStage(opportunity),gate=resumeGate(opportunity);
 const verified=opportunity.requirements.filter(r=>r.verified&&r.strength==="strong").length;
 const saved:Record<string,string>={overview:verified?`${verified} 条已核验依据`:"",resume:gate.frozen?`版本 V${gate.frozen.version}`:"",interview:opportunity.interviewPractices?.length?`${opportunity.interviewPractices.length} 次已存反馈`:"",review:opportunity.reviewReports?.length?`${opportunity.reviewReports.length} 份已存复盘`:""};
 return <div className={styles.timeline}>
  <header className={styles.identity}><h1>{opportunity.role}</h1><div><span>{opportunity.company}</span><span className={styles.stageLabel}>{journeyStages.find(s=>s.id===current)?.label}中</span>{opportunity.location&&<span>{opportunity.location}</span>}</div></header>
  <ol aria-label="岗位时间线" title="自由浏览不会改变实际进度；完成状态以保存的材料、版本和记录为准。">{journeyStages.map((s,i)=><li key={s.id}><button onClick={()=>onSelect(s.id)} aria-current={selected===s.id?"step":undefined}><span className={styles.node}>{i+1}</span><strong>{s.label}</strong><small>{saved[s.id]||(s.id===current?"当前阶段":s.id==="review"?"与面试并行":"浏览阶段")}</small></button></li>)}</ol>
  <section className={styles.current} aria-label="当前进度">
   <div className={styles.statusCopy}><div className={styles.statusTitle}><ShieldCheck size={16}/><strong>{gate.ready?"投递质检通过":"就绪度待核验"}</strong><span>已核验 {verified}/{opportunity.requirements.length}</span></div><p>{gate.reason}</p></div>
   {selected!==current?<button className={styles.returnButton} onClick={()=>onSelect(current)}><ArrowLeft size={14}/>回到当前阶段</button>:current==="resume"&&opportunity.workspaceType!=="preparation"?<button disabled={!gate.ready||freezing} onClick={onFreeze}><LockKeyhole size={14}/>{freezing?"正在冻结…":"冻结投递版"}</button>:null}
  </section>
  {gate.frozen&&<details className={styles.asset}><summary>已冻结 V{gate.frozen.version} · 查看版本凭证</summary><code>{gate.frozen.id}</code></details>}
 </div>;
}
