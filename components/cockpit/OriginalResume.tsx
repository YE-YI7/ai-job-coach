"use client";
import type { Opportunity } from "@/lib/opportunities/types";
import { originalResumeUrl } from "@/lib/resume-original";
import { FileText, ArrowUpRight } from "lucide-react";
import styles from "./CockpitApp.module.css";

export default function OriginalResume({opportunity}:{opportunity:Opportunity}) {
 const original = opportunity.resumeOriginal;
 return <div className={styles.originalResume}>
  {original ? <>
   <div className={styles.originalResumeToolbar}><span><FileText size={16}/>{original.name}</span><a href={originalResumeUrl(original,true)} target="_blank" rel="noopener noreferrer">打开原文件<ArrowUpRight size={15}/></a></div>
   {original.mime === "application/pdf" ? <iframe key={original.path} title="上传的原始简历，保留原排版" src={`${originalResumeUrl(original)}#toolbar=0&navpanes=0&view=FitH`}/> : <p>原文件已保留。<a href={originalResumeUrl(original,true)}>下载查看原版</a></p>}
  </> : <div className={styles.originalResumeMissing}><FileText size={24}/><p>{opportunity.resumeText ? "当前只有文本记录；重新上传文件后，这里会显示原版。" : "上传简历，保留原排版"}</p>{opportunity.resumeText&&<details><summary>查看文本记录</summary><pre>{opportunity.resumeText}</pre></details>}</div>}
 </div>;
}
