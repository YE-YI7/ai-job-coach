"use client";
import type {Opportunity} from "@/lib/opportunities/types";
import {journeyStages,currentJourneyStage,resumeGate,type JourneyStage} from "@/lib/opportunities/timeline";
import styles from "./JobTimeline.module.css";
export default function JobTimeline({opportunity,selected,onSelect,onFreeze,freezing}:{opportunity:Opportunity;selected:string;onSelect:(stage:JourneyStage)=>void;onFreeze:()=>void;freezing:boolean}){
 const current=currentJourneyStage(opportunity),gate=resumeGate(opportunity);
 const verified=opportunity.requirements.filter(r=>r.verified&&r.strength==="strong").length;
 const saved:Record<string,string>={overview:verified?`${verified} 条已核验依据`:"",resume:gate.frozen?`版本 V${gate.frozen.version}`:"",interview:opportunity.interviewPractices?.length?`${opportunity.interviewPractices.length} 次已存反馈`:"",review:opportunity.reviewReports?.length?`${opportunity.reviewReports.length} 份已存复盘`:""};
 return <div className={styles.timeline}>
  <section className={styles.current} aria-label="当前进度">
   <div><small>{opportunity.company} · 当前阶段</small><h2>{journeyStages.find(s=>s.id===current)?.label}</h2></div>
   <p>已核验依据 <strong>{verified}/{opportunity.requirements.length}</strong> · {gate.ready?"投递质检通过":"就绪度待核验"}</p>
   <p>{gate.reason}</p>
   {gate.frozen&&<p className={styles.asset}>已冻结 V{gate.frozen.version} · <code>{gate.frozen.id}</code></p>}
   {selected!==current?<button onClick={()=>onSelect(current)}>回到当前阶段</button>:current==="resume"&&opportunity.workspaceType!=="preparation"?<button disabled={!gate.ready||freezing} onClick={onFreeze}>{freezing?"正在保存版本…":gate.ready?"冻结投递版本":gate.reason}</button>:null}
  </section>
  <ol aria-label="岗位时间线">{journeyStages.map((s,i)=><li key={s.id}><button onClick={()=>onSelect(s.id)} aria-current={selected===s.id?"step":undefined}><span>{i+1}</span><strong>{s.label}</strong>{s.id===current&&<small>当前</small>}{s.id==="review"&&<small>与面试并行</small>}{saved[s.id]&&<small>{saved[s.id]}</small>}</button></li>)}</ol>
  <p className={styles.caption}>自由浏览不会改变实际进度；完成状态以保存的材料、版本和记录为准。</p>
 </div>;
}
