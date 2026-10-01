"use client";
import { useState } from "react";
import Image from "next/image";
import { MapPin, BriefcaseBusiness, ArrowUpRight, CheckCircle2, ArrowRight } from "lucide-react";
import { companyLogo } from "@/lib/jobs/company-logos";
import type { VerifiedJob } from "@/lib/jobs/verification-gate";
import styles from "./JobDiscovery.module.css";
export type JobCandidate = VerifiedJob & { reasons: string[] };
export default function JobResultCard({job,disabled,importing,degraded,onImport}:{job:JobCandidate;disabled:boolean;importing:boolean;degraded:boolean;onImport:()=>void}){
 const skills=job.reasons.find(reason=>reason.includes("同时提到"));
 const logo=companyLogo(job.company);
 const [failedLogo,setFailedLogo]=useState<string|null>(null);
 const siteOf=(url:string)=>url.replace(/^https?:\/\//,"").split("/")[0];
 return <article className={styles.card}>
  <div className={styles.cardHead}><div className={styles.companyMark}>{logo&&failedLogo!==logo?<Image src={logo} alt={`${job.company}官方标识`} width={46} height={46} onError={()=>setFailedLogo(logo)}/>:<span aria-label={`${job.company}，暂无可用标识`}>{job.company.slice(0,2)}</span>}</div><div className={styles.identity}><h4>{job.title}</h4><p className={styles.company}>{job.company}</p></div></div>
  <div className={styles.attributes}><span><MapPin size={15}/>{job.location||"地点待核实"}</span>{job.jdRequirements.length>0?<span><BriefcaseBusiness size={15}/>{job.jdRequirements.map(r=>r.label).join(" · ")}</span>:<span>门槛详见招聘原文</span>}</div>
  <p className={styles.match}><CheckCircle2 size={16}/>{skills||"岗位名称符合你的求职方向"}</p>
  <details className={styles.details}><summary>为什么推荐 · 查看筛选依据</summary><p>{job.reasons.join("；")}。当前是关键词初筛，不是能力匹配分。</p><p>{degraded?"公司层次本次未核实。":job.verified?`公司层次：${job.tierLabel}。${job.tierReason}`:"公司层次尚未核实，不据此排除。"}</p>{job.tierBasis&&<p>{job.tierBasis}</p>}{job.tierSources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">层次证据：{siteOf(source.url)}</a></p>)}<p>{job.freshness==="in_sale"?"来源标注近30天内发布，是否仍在招聘请以原页为准。":"首次发布时间未知或较早，是否仍在招聘请查看原页。"}</p><p>官网列表可能只有职责摘要；完整任职要求以招聘原文为准。</p></details>
  <div className={styles.footer}><div className={styles.provenance}><a href={job.url} target="_blank" rel="noopener noreferrer">查看招聘原文<ArrowUpRight size={14}/></a><small>读取于 {new Date(job.checkedAt).toLocaleDateString("zh-CN")}</small></div><button type="button" className={styles.import} disabled={disabled} onClick={onImport}>{importing?"正在分析…":"看看我适不适合"}<ArrowRight size={16}/></button></div>
 </article>;
}
