"use client";
import { useState } from "react";
import Image from "next/image";
import { MapPin, BriefcaseBusiness, ArrowUpRight, CheckCircle2, ArrowRight, CircleAlert } from "lucide-react";
import { companyLogo } from "@/lib/jobs/company-logos";
import type { ReviewedJob } from "@/lib/jobs/personalization";
import type {Opportunity} from '@/lib/opportunities/types';
import { JOB_DECISION_LABEL, JOB_DECISION_ORDER, JOB_DECISION_REASONS, type JobDecision, type JobDecisionKind } from "@/lib/jobs/job-decision";
import styles from "./JobDiscovery.module.css";

export type JobCandidate = ReviewedJob & { reasons: string[] };

interface Props {
  job: JobCandidate;
  disabled: boolean;
  importing: boolean;
  degraded: boolean;
  onImport: () => void;
  assessment?:Opportunity;
  onOpenJob:(id:string)=>void;
  /** 用户在上一批里对同一条岗表过的态（按来源链接找回）。 */
  decision: JobDecision | null;
  /** 材料换过版本：旧决定仍在，但不能让它看起来像是新简历算出来的。 */
  staleMaterials: boolean;
  decisionBusy: boolean;
  decisionError: string | null;
  onDecide: (kind: JobDecisionKind, reason: string | null) => void;
}

export default function JobResultCard({ job, disabled, importing, degraded, onImport, assessment, onOpenJob, decision, staleMaterials, decisionBusy, decisionError, onDecide }: Props) {
  const { review } = job;
  const logo = companyLogo(job.company);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const [editing, setEditing] = useState(!decision);
  const [reason, setReason] = useState<string | null>(decision?.reason ?? null);
  const siteOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];
  const decide = (kind: JobDecisionKind) => { setEditing(false); onDecide(kind, reason?.trim() || null); };
  const verdict = review.eligibility === "pass" ? "值得进一步了解" : "先核实条件";
  return <article className={styles.card}>
    <div className={styles.cardHead}>
      <div className={styles.companyMark}>{logo && failedLogo !== logo ? <Image src={logo} alt={`${job.company}官方标识`} width={46} height={46} onError={() => setFailedLogo(logo)}/> : <span aria-label={`${job.company}，暂无可用标识`}>{job.company.slice(0, 2)}</span>}</div>
      <div className={styles.identity}><h4>{job.title}</h4><p className={styles.company}>{job.company}</p></div>
      <p className={styles.verdict} data-state={review.eligibility === "pass" ? "ready" : "check"}>
        {review.eligibility === "pass" ? <CheckCircle2 size={15}/> : <CircleAlert size={15}/>}{verdict}
      </p>
    </div>
    <div className={styles.attributes}>
      <span><MapPin size={15}/>{job.location || "地点待核实"}</span>
      {job.jdRequirements.length > 0 ? <span><BriefcaseBusiness size={15}/>{job.jdRequirements.map(r => r.label).join(" · ")}</span> : <span>门槛详见招聘原文</span>}
    </div>
    <p className={styles.match}><CheckCircle2 size={16}/>{review.fitReason}</p>
    {review.decisionRisk && <p className={styles.risk}><CircleAlert size={16}/>最影响你决定的一条：{review.decisionRisk.text}</p>}
    <details className={styles.details}>
      <summary>依据与出处</summary>
      <div className={styles.compare}>
        <p><strong>岗位要求原文</strong>{review.requirementRefs.map(ref => <span key={ref.id} className={styles.quote}>{ref.text}</span>)}</p>
        <p><strong>你简历里的原文</strong>{review.resumeRefs.length ? review.resumeRefs.map(ref => <span key={ref.id} className={styles.quote}>{ref.text}</span>) : <span className={styles.quote}>简历里没有能与之对照的段落</span>}</p>
      </div>
      {job.reasons.map((line, index) => <p key={index}>{line}</p>)}
      <p>{degraded ? "公司层次本次未核实。" : job.verified ? `公司层次：${job.tierLabel}。${job.tierReason}` : "公司层次尚未核实，不据此排除。"}</p>
      {job.tierBasis && <p>{job.tierBasis}</p>}
      {job.tierSources.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">层次证据：{siteOf(source.url)}</a></p>)}
      <p>{job.freshness === "in_sale" ? "来源标注近30天内发布，是否仍在招聘请以原页为准。" : "首次发布时间未知或较早，是否仍在招聘请查看原页。"}</p>
      <p>官网列表可能只有职责摘要；完整任职要求以招聘原文为准。以上依据都取自本轮公开抓取，不代表录用概率。</p>
    </details>
    <div className={styles.decision}>
      {decision && !editing ? <p className={styles.decided}>
        <CheckCircle2 size={15}/>你的打算：{JOB_DECISION_LABEL[decision.decision]}{decision.reason ? `（${decision.reason}）` : ""}
        <button type="button" className={styles.decisionEdit} disabled={disabled || decisionBusy} onClick={() => { setReason(decision.reason); setEditing(true); }}>改主意</button>
        {staleMaterials && <small>这条决定是对上一份材料做的，当时的判断仍在。</small>}
      </p> : <fieldset className={styles.decisionGroup} disabled={disabled || decisionBusy}>
        <legend>{decision ? "改成：" : "这条你的打算是？（可选，不选也能走）"}</legend>
        <div className={styles.decisionChoices}>
          {JOB_DECISION_ORDER.map(kind => <button key={kind} type="button" className={styles.decisionChoice} onClick={() => decide(kind)}>
            {JOB_DECISION_LABEL[kind]}{kind === "advance" ? "（进工作台，不会标成已投递）" : ""}
          </button>)}
        </div>
        <div className={styles.decisionReason}>
          {JOB_DECISION_REASONS[(decision?.decision ?? "not_now") as JobDecisionKind].map(preset => <button key={preset} type="button" className={styles.reasonPreset} aria-pressed={reason === preset} disabled={disabled || decisionBusy} onClick={() => setReason(reason === preset ? null : preset)}>{preset}</button>)}
          <input className={styles.reasonInput} value={reason ?? ""} maxLength={200} disabled={disabled || decisionBusy} placeholder="或自己写一句（可不填）" onChange={e => setReason(e.target.value)}/>
        </div>
        {decision && <button type="button" className={styles.decisionCancel} disabled={decisionBusy} onClick={() => { setEditing(false); setReason(decision.reason); }}>不改了</button>}
      </fieldset>}
      {decisionBusy && <p role="status">正在记下你的决定…</p>}
      {decisionError && <p role="status" className={styles.decisionFailed}>{decisionError}</p>}
    </div>
    <div className={styles.footer}>
      <div className={styles.provenance}>
        <a href={job.url} target="_blank" rel="noopener noreferrer">查看招聘原文<ArrowUpRight size={14}/></a>
        <small>读取于 {new Date(job.checkedAt).toLocaleDateString("zh-CN")}</small>
      </div>
      <button type="button" className={styles.import} disabled={disabled} onClick={onImport}>{importing ? "正在保存判断…" : assessment ? "判断已保存" : "看看是否值得投 · 不额外扣额度"}<ArrowRight size={16}/></button>
    </div>
    {assessment&&<section className={styles.assessment} aria-label="投递判断" role="status"><h5>{assessment.recommendationLabel}</h5><p>{assessment.recommendationReason}</p><button type="button" onClick={()=>onOpenJob(assessment.id)}>打开已保存的岗位 <ArrowRight size={16}/></button><small>已加入左侧机会列表 · 复用搜岗评审，不额外扣额度</small></section>}
  </article>;
}
