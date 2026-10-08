"use client";
import {useState} from "react";
import type {Opportunity} from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";
import JobDiscovery from "./JobDiscovery";
import {ArrowUpRight,Check,FileText,Compass} from "lucide-react";

export default function ProfileWorkspace({opportunity,jobs,onAddJob,onSelectJob,onCoach,onSaveDirection,onImportJob,children}:{opportunity:Opportunity;jobs:Opportunity[];onAddJob:()=>void;onSelectJob:(id:string)=>void;onCoach:()=>void;onSaveDirection:(role:string,location:string)=>Promise<void>;onImportJob:(sourceText:string)=>Promise<void>;children:React.ReactNode}){
 const [role,setRole]=useState(opportunity.role),[location,setLocation]=useState(opportunity.location||"");
 const [busy,setBusy]=useState(false),[result,setResult]=useState("");
 return <div className={styles.profileWorkspace}>
  <header className={styles.profileHeading}><div><h1>我的简历与方向</h1><p>从你的经历出发，找到下一步。</p></div><Compass size={32} strokeWidth={1.4}/></header>
  {opportunity.resumeText&&<details className={styles.profileResume}><summary><FileText size={22}/><span><strong>基础简历 · 查看 / 更新</strong><small>用于找岗与分析，岗位定制稿单独保留</small></span><span className={styles.profileReady}><Check size={13}/>已收录</span></summary><pre>{opportunity.resumeText}</pre><div>{children}</div></details>}
  <section className={styles.profileDirection}><h2>{opportunity.resumeText?"你想往哪个方向走？":"先给我一份简历"}</h2>
   <form className={styles.directionForm} onSubmit={async e=>{e.preventDefault();setBusy(true);setResult("");try{await onSaveDirection(role.trim(),location.trim());setResult("方向已保存");}catch(error){setResult(error instanceof Error?error.message:"保存失败，修改仍在");}finally{setBusy(false);}}}>
    <label>求职方向<input value={role} maxLength={160} disabled={busy} onChange={e=>{setRole(e.target.value);setResult("");}}/></label>
    <label>城市 / 远程<input value={location} maxLength={160} disabled={busy} onChange={e=>{setLocation(e.target.value);setResult("");}}/></label>
    <button className={styles.secondaryButton} disabled={busy||!role.trim()}>{busy?"保存中…":"确认方向"}</button>
    {result&&<p role="status">{result}</p>}
   </form>
   <button className={styles.profileCoachLink} onClick={onCoach}>还没想好，让导师带我梳理 <ArrowUpRight size={16}/></button>
   {!opportunity.resumeText&&children}
  </section>
  <section aria-label="岗位">
   <JobDiscovery key={`${opportunity.id}:${opportunity.role}:${opportunity.location}`} profileId={opportunity.id} ready={!!opportunity.resumeText?.trim() && role.trim()===opportunity.role && location.trim()===(opportunity.location||"")} onImport={onImportJob} onAddJob={onAddJob}/>
   <button className={styles.secondaryButton} onClick={onAddJob}>我有岗位，看看是否合适</button>
   {!!jobs.length&&<div className={styles.existingJobList}>{jobs.map(job=><button key={job.id} onClick={()=>onSelectJob(job.id)}><span><small>{job.company}</small><strong>{job.role}</strong></span><span>继续</span></button>)}</div>}
  </section>
 </div>;
}
