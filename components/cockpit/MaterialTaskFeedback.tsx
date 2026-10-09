"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, FileText, ShieldCheck } from "lucide-react";
import { INTAKE_PHASE_LABELS, intakeReceipt, type IntakePhase } from "@/lib/opportunities/intake-flow";
import type { Opportunity } from "@/lib/opportunities/types";
import styles from "./MaterialTaskFeedback.module.css";

export function MaterialDataNotice() {
  const [provider, setProvider] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/opportunities/intake-info", { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (response.ok && typeof data.provider === "string") setProvider(data.provider); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <details className={styles.dataNotice}>
    <summary><ShieldCheck size={16} aria-hidden="true"/>提交会上传到云端，并发送给 AI 模型 <span>数据去向</span></summary>
    <p>本次模型：{provider || "尚未确认；可能为站点 StepFun / DeepSeek，或你连接的 TokenDance 服务。"}</p>
    <p>文件先在服务端解析为文字；分析所需文字会发送给模型。保存后的原文和结果进入你的云端工作区，不是本地处理模式。保存失败时，页面暂存整理结果供本次重试，请勿刷新。</p>
    <p>材料与结果保留至删除；不承诺自动脱敏或 30 天自动清除。请先移除联系方式和保密内容。可删除岗位；底层来源与备份的清除可通过隐私页联系入口申请。</p>
    <a href="/privacy" target="_blank" rel="noreferrer">查看隐私说明</a>
  </details>;
}

export function MaterialTaskProgress({ phase, startedAt, requestId }: { phase: IntakePhase; startedAt: number; requestId: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [startedAt]);
  const phases = Object.keys(INTAKE_PHASE_LABELS) as IntakePhase[];
  const current = phases.indexOf(phase);
  return <section className={styles.progress} aria-label="材料整理状态">
    <div className={styles.progressHeading} role="status"><strong>{INTAKE_PHASE_LABELS[phase]}</strong><span>已等待 {seconds} 秒</span></div>
    <ol>{phases.map((item, index) => <li key={item} aria-current={index === current ? "step" : undefined}><span>{index < current ? <Check size={13} aria-label="完成"/> : index + 1}</span>{INTAKE_PHASE_LABELS[item]}</li>)}</ol>
    {seconds >= 10 && <p>仍在处理，暂未完成。请保留此页面；不会按等待时间重复扣次数。失败后材料仍在，可以重试。</p>}
    {requestId && <small>任务编号：{requestId}</small>}
  </section>;
}

export function MaterialReceipt({ opportunity, deferred, onContinue }: { opportunity: Opportunity; deferred: boolean; onContinue: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, []);
  const receipt = intakeReceipt(opportunity, deferred);
  return <section className={styles.receipt} aria-label="材料识别与保存结果">
    <div className={styles.receiptHeading}><FileText size={28} aria-hidden="true"/><div><h1 ref={headingRef} tabIndex={-1}>{receipt.title}</h1><p>{receipt.savedAt}</p></div></div>
    <dl><div><dt>识别为</dt><dd>{receipt.kind}</dd></div><div><dt>{opportunity.workspaceType === "preparation" ? "求职方向" : "公司 / 岗位"}</dt><dd>{opportunity.workspaceType === "preparation" ? opportunity.role : `${opportunity.company} · ${opportunity.role}`}</dd></div><div><dt>地点</dt><dd>{opportunity.location || "待确认"}</dd></div></dl>
    {!!receipt.requirements.length && <div><h2>JD 中的关键要求</h2><ul>{receipt.requirements.map((requirement, i) => <li key={i}>{requirement}</li>)}</ul></div>}
    {!!receipt.missing.length && <p>还需确认：{receipt.missing.join("、")}</p>}
    <p>{receipt.reason}</p>
    <details><summary>查看已保存的材料</summary><pre>{opportunity.jdText || opportunity.resumeText || opportunity.profileText}</pre></details>
    <footer><span><Check size={16}/>{opportunity.id.startsWith("web-") ? "预览结果 · 未写入云端" : `云端已保存 · ${opportunity.id.slice(0, 8)}`}</span><button onClick={onContinue}>{receipt.next}<ArrowRight size={16}/></button></footer>
  </section>;
}
