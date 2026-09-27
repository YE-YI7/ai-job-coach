"use client";
import {useState} from "react";
import type {Opportunity} from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";
import JobDiscovery from "./JobDiscovery";

export default function ProfileWorkspace({opportunity,jobs,onAddJob,onSelectJob,onCoach,onSaveDirection,onImportJob,children}:{opportunity:Opportunity;jobs:Opportunity[];onAddJob:()=>void;onSelectJob:(id:string)=>void;onCoach:()=>void;onSaveDirection:(role:string,location:string)=>Promise<void>;onImportJob:(sourceText:string)=>Promise<void>;children:React.ReactNode}){
 const [role,setRole]=useState(opportunity.role),[location,setLocation]=useState(opportunity.location||"");
 const [busy,setBusy]=useState(false),[result,setResult]=useState("");
 return <div className={styles.profileWorkspace}>
  <h1>我的简历与方向</h1>
  <p>这是你的基础档案。选定岗位后再做定制，已有岗位版本不会被覆盖。</p>
  <section><h2>{opportunity.resumeText?"简历已收到，先确认方向":"先给我一份简历"}</h2>
   <form className={styles.directionForm} onSubmit={async e=>{e.preventDefault();setBusy(true);setResult("");try{await onSaveDirection(role.trim(),location.trim());setResult("方向已保存");}catch(error){setResult(error instanceof Error?error.message:"保存失败，修改仍在");}finally{setBusy(false);}}}>
    <label>求职方向<input value={role} maxLength={160} disabled={busy} onChange={e=>{setRole(e.target.value);setResult("");}}/></label>
    <label>城市 / 远程<input value={location} maxLength={160} disabled={busy} onChange={e=>{setLocation(e.target.value);setResult("");}}/></label>
    <button className={styles.secondaryButton} disabled={busy||!role.trim()}>{busy?"保存中…":"确认方向"}</button>
    {result&&<p role="status">{result}</p>}
   </form>
   <button className={styles.primaryButton} onClick={onCoach}>还没想好，让导师带我梳理</button>
   {opportunity.resumeText&&<details><summary>查看基础简历原文</summary><pre>{opportunity.resumeText}</pre></details>}
   {children}
  </section>
  <section><h2>接下来，选一个岗位推进</h2><p>基础简历会带入新岗位，不必重复上传。</p>
   <JobDiscovery key={`${opportunity.id}:${opportunity.role}:${opportunity.location}`} profileId={opportunity.id} ready={!!opportunity.resumeText?.trim() && role.trim()===opportunity.role && location.trim()===(opportunity.location||"")} onImport={onImportJob}/>
   <button className={styles.secondaryButton} onClick={onAddJob}>我有岗位，看看是否合适</button>
   {!!jobs.length&&<div className={styles.existingJobList}>{jobs.map(job=><button key={job.id} onClick={()=>onSelectJob(job.id)}><span><small>{job.company}</small><strong>{job.role}</strong></span><span>继续</span></button>)}</div>}
  </section>
 </div>;
}
