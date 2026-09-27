"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import type { DiscoveredJob } from "@/lib/jobs/discovery";
import styles from "./CockpitApp.module.css";

type Candidate = DiscoveredJob & { reasons: string[] };
export default function JobDiscovery({profileId, ready, onImport}: {
  profileId: string; ready: boolean; onImport: (sourceText: string) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false), [importing, setImporting] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const discover = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage(""); setJobs([]);
    try {
      const response = await fetch("/api/coach/jobs/discover", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileId}),signal:abort.signal});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "查找失败，请重试");
      setJobs(result.jobs);
      setMessage([result.jobs.length ? "找到这些候选，先看来源，再决定是否分析。" : "当前两个来源没有符合方向和城市的岗位，不代表其他公司没有机会。可以调整方向或导入你找到的 JD。",
        result.failedSources?.length ? `${result.failedSources.join("、")} 暂时无法读取，结果不完整。` : ""].filter(Boolean).join(" "));
    } catch(error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "查找失败，请重试");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }, [profileId]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => { void discover(); }, 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); };
  }, [ready, discover]);
  return <div className={styles.jobDiscovery}>
    <button className={styles.primaryButton} disabled={!ready || busy || !!importing} onClick={discover}>{busy ? "正在按简历与方向筛选…" : "重新查找岗位"}</button>
    <p>{ready ? "首批仅覆盖 Meshy、Kong，按已保存的方向和城市筛选；不消耗模型额度。" : "先保存简历和方向，再找岗位。"}</p>
    {message && <p role="status">{message}</p>}
    {jobs.map(job=><article key={job.id} className={styles.discoveredJob}>
      <div><h3>{job.title}</h3><p>{job.company} · {job.location || "地点未注明"}</p></div>
      <p>{job.reasons.join("；")}。这是关键词初筛，不是能力匹配结论。</p>
      <small>来源读取于 {new Date(job.checkedAt).toLocaleString("zh-CN")} · 是否仍在招聘以原页为准</small>
      <div className={styles.discoveryActions}>
        <a href={job.url} target="_blank" rel="noopener noreferrer">查看招聘原页</a>
        <button className={styles.secondaryButton} disabled={!!importing || busy} onClick={async()=>{
          setImporting(job.id); setMessage("");
          try { await onImport(`公司：${job.company}\n岗位：${job.title}\n地点：${job.location}\n来源：${job.url}\n\n${job.description}`); }
          catch(error){setMessage(error instanceof Error?error.message:"岗位分析失败，可以重试");}
          finally{setImporting("");}
        }}>{importing===job.id?"正在分析…":"带上简历分析此岗"}</button>
      </div>
    </article>)}
    {!!jobs.length && <p>岗位分析会调用你配置的模型；不会自动投递，也不会向招聘网站发送简历。</p>}
  </div>;
}
