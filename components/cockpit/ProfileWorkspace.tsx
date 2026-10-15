"use client";
import {useState} from "react";
import type {Opportunity} from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";
import JobDiscovery from "./JobDiscovery";
import {ArrowUpRight} from "lucide-react";

export default function ProfileWorkspace({opportunity,jobs,onAddJob,onSelectJob,onCoach,onSaveDirection,onImportJob,children,editor,onViewChange}:{opportunity:Opportunity;jobs:Opportunity[];onAddJob:()=>void;onSelectJob:(id:string)=>void;onCoach:()=>void;onSaveDirection:(role:string,location:string)=>Promise<void>;onImportJob:(opportunity:Opportunity)=>void;children:React.ReactNode;editor:React.ReactNode;onViewChange?:(view:string)=>void}){
 const [role,setRole]=useState(opportunity.role),[location,setLocation]=useState(opportunity.location||"");
 const [busy,setBusy]=useState(false),[result,setResult]=useState("");
 const [view,setView]=useState<"profile"|"jobs"|"direction">("profile");
 return <div className={styles.profileWorkspace}>
  <header className={styles.profileHeading}><h1>我的简历</h1>{opportunity.resumeText?<details className={styles.profileFileMenu}><summary>更新原简历</summary><div>{children}</div></details>:null}</header>
  <div className={styles.profileViewTabs} role="group" aria-label="个人档案视图"><button type="button" aria-pressed={view==="profile"} onClick={()=>{setView("profile");onViewChange?.("profile");}}>简历</button><button type="button" aria-pressed={view==="jobs"} onClick={()=>{setView("jobs");onViewChange?.("jobs");}}>找岗位</button><button type="button" aria-pressed={view==="direction"} onClick={()=>{setView("direction");onViewChange?.("direction");}}>求职方向</button></div>
  <div hidden={view!=="profile"}>
  {!opportunity.resumeText&&<div className={styles.profileResumeTools}>{children}</div>}
  {editor}
  {!opportunity.resumeText && opportunity.profileText && opportunity.recommendationLabel === "等待完成分析" && <section aria-label="待确认材料原文"><h2>原文已保存，尚未确认材料类型</h2><details className={styles.profileResume}><summary>查看原始材料</summary><pre>{opportunity.profileText}</pre></details><button className={styles.secondaryButton} onClick={onAddJob}>这是岗位 JD，用原文继续整理 <ArrowUpRight size={16}/></button></section>}
  </div>
  <section className={styles.profileDirection} hidden={view!=="direction"}><h2>求职方向</h2>
   <form className={styles.directionForm} onSubmit={async e=>{e.preventDefault();setBusy(true);setResult("");try{await onSaveDirection(role.trim(),location.trim());setResult("方向已保存");}catch(error){setResult(error instanceof Error?error.message:"保存失败，修改仍在");}finally{setBusy(false);}}}>
    <label>求职方向<input value={role} maxLength={160} disabled={busy} onChange={e=>{setRole(e.target.value);setResult("");}}/></label>
    <label>城市 / 远程<input value={location} maxLength={160} disabled={busy} onChange={e=>{setLocation(e.target.value);setResult("");}}/></label>
    <button className={styles.secondaryButton} disabled={busy||!role.trim()}>{busy?"保存中…":"确认方向"}</button>
    {result&&<p role="status">{result}</p>}
   </form>
   <button className={styles.profileCoachLink} onClick={onCoach}>还没想好，让导师带我梳理 <ArrowUpRight size={16}/></button>
  </section>
  <section aria-label="岗位" hidden={view!=="jobs"}>
   {view==="jobs"&&<JobDiscovery key={`${opportunity.id}:${opportunity.role}:${opportunity.location}`} profileId={opportunity.id} ready={!!opportunity.resumeText?.trim() && role.trim()===opportunity.role && location.trim()===(opportunity.location||"")} onImport={onImportJob} onOpenJob={onSelectJob} savedJobs={jobs} onAddJob={onAddJob}/>}
   <button className={styles.secondaryButton} onClick={onAddJob}>我有岗位，看看是否合适</button>
   {!!jobs.length&&<div className={styles.existingJobList}>{jobs.map(job=><button key={job.id} onClick={()=>onSelectJob(job.id)}><span><small>{job.company}</small><strong>{job.role}</strong></span><span>继续</span></button>)}</div>}
  </section>
 </div>;
}
