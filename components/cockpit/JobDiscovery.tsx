"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { PENDING_LABEL, type HardDimension } from "@/lib/jobs/labels";
import type { FilteredJob } from "@/lib/jobs/retrieval-gate";
import type { CompanyTier } from "@/lib/coach-harness/subagents/verification";
import type { ReviewedJob } from "@/lib/jobs/personalization";
import { decisionEntityKey, decisionForUrl, isStaleMaterials, type JobDecision, type JobDecisionKind } from "@/lib/jobs/job-decision";
import { groupCandidates, zeroCandidateState } from "@/lib/jobs/result-presentation";
import styles from "./CockpitApp.module.css";
import { needsExplicitSearch, waitForSavedSearch } from "@/lib/jobs/search-recovery";
import { RefreshCw } from "lucide-react";
import JobResultCard from "./JobResultCard";
import discoveryStyles from "./JobDiscovery.module.css";

type Candidate = ReviewedJob & { reasons: string[] };
type VerificationSummary = { status: "ok" | "degraded"; note: string | null; coverage: { total: number; inDirectory: number } };
type TierOption = { value: CompanyTier; label: string };
type SearchSummary = { keywords: string[]; blockedCount: number; calls: number; truncatedCalls: number; credit: string;
  alreadyTracked?: { company: string; title: string }[];
  sources: { label: string; homepage: string; coverageNote: string }[] };
type TierPreference = {
  effectiveTiers: CompanyTier[]; origin: "explicit" | "unset";
  sourceExcerpt: string | null; claimId: string | null;
  pending: { claimId: string; tiers: CompanyTier[]; excerpt: string } | null;
};
/** 一条决定必须说清「对哪一批、哪份材料」；这两个值都来自本轮查找结果，界面不自己编。 */
type Batch = { runId: string; materialsVersion: string };
export default function JobDiscovery({profileId, ready, onImport, onAddJob}: {
  profileId: string; ready: boolean; onImport: (sourceText: string) => Promise<void>; onAddJob: () => void;
}) {
  const [jobs, setJobs] = useState<Candidate[]>([]);
  const [filtered, setFiltered] = useState<FilteredJob[]>([]);
  const [pending, setPending] = useState<HardDimension[]>([]);
  const [verification, setVerification] = useState<VerificationSummary | null>(null);
  const [search, setSearch] = useState<SearchSummary | null>(null);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [tierOptions, setTierOptions] = useState<TierOption[]>([]);
  const [preference, setPreference] = useState<TierPreference | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [decisions, setDecisions] = useState<JobDecision[]>([]);
  const [decisionBusy, setDecisionBusy] = useState(""), [decisionError, setDecisionError] = useState(""); const [decisionErrorFor, setDecisionErrorFor] = useState("");
  const [tierBusy, setTierBusy] = useState(false), [tierMessage, setTierMessage] = useState("");
  const [busy, setBusy] = useState(false), [importing, setImporting] = useState("");
  const [message, setMessage] = useState("");
  const [hasResult,setHasResult]=useState(false);
  const decisionRequests=useRef(new Map<string,{id:string;signature:string;expectedClaimId:string|null}>());
  const [showFiltered, setShowFiltered] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const imported = useRef(new Set<string>());
  useEffect(()=>()=>controller.current?.abort(),[]);
  const loadDecisions = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/coach/jobs/decisions", {cache:"no-store", signal});
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || "决定读取失败");
      setDecisions(result.decisions);
    } catch (error) {
      // 决定读不回来只影响「找回上次表过的态」，不能连带把本轮查找结果说成没查到
      if (!signal?.aborted) setDecisionError(error instanceof Error ? error.message : "决定读取失败，本次没有改动");
    }
  }, []);
  const discover = useCallback(async (restore = false) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setHasResult(false);setBatch(null);setMessage(""); setJobs([]); setFiltered([]); setPending([]); setVerification(null); setSearch(null); setFailedSources([]); setShowFiltered(false);
    try {
      let result;
      {
        const readSaved = async () => {
        const previous = await fetch(`/api/coach/jobs/discover?profileId=${encodeURIComponent(profileId)}`, { cache: "no-store", signal: abort.signal });
        const saved = await previous.json();
        if (!previous.ok) throw Error(saved.error || "上次搜索读取失败，请重试");
        return saved;
        };
        let saved = await readSaved();
        if (["running", "pending"].includes(saved.status)) {
          setMessage("正在等上次搜索结果，不会重复启动；你可以继续浏览其他内容。");
          saved = await waitForSavedSearch(readSaved, abort.signal);
          if (!saved.found) {
            setMessage(["failed", "cancelled"].includes(saved.status) ? "上次搜索未完成，可重新查找；简历仍保留。" : "上次搜索仍在进行，可稍后查看；没有重复启动。");
            return;
          }
          result = saved.result;
        } else if (restore && saved.found) { result = saved.result; }
        else if (restore && ["failed", "cancelled", "partial"].includes(saved.status)) {
          setMessage("上次搜索未完成，可重新查找；不会自动重复执行。"); return;
        }
        else if (needsExplicitSearch(restore, saved)) {
          setMessage("资料或搜索范围已更新。点击重新查找后才会重新评审并消耗 AI 额度。"); return;
        }
      }
      if (!result) {
        const response = await fetch("/api/coach/jobs/discover", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileId,requestId:crypto.randomUUID()}),signal:abort.signal});
        result = await response.json();
        if (!response.ok) throw Error(result.error || "查找失败，请重试");
        if (response.status === 202) {
          setMessage(result.note || "正在等待搜索结果…");
          const saved = await waitForSavedSearch(async () => {
            const r = await fetch(`/api/coach/jobs/discover?profileId=${encodeURIComponent(profileId)}`, { cache: "no-store", signal: abort.signal });
            const b = await r.json(); if (!r.ok) throw Error(b.error || "结果读取失败"); return b;
          }, abort.signal);
          if (!saved.found) { setMessage("搜索未完成，请查看任务进度；没有重复启动。"); return; }
          result = saved.result;
        }
      }
      if (!Array.isArray(result.jobs)) throw Error("搜索结果尚未完整保存，请重试");
      setJobs(result.jobs);
      setHasResult(true);
      setFiltered(result.filtered ?? []);
      setPending(result.pendingProfileFields ?? []);
      setVerification(result.verification ?? null);
      setTierOptions(result.tierOptions ?? []);
      setPreference(result.tierPreference ?? null);
      setSearch(result.search ?? null);
      setFailedSources(result.failedSources ?? []);
      setBatch(result.runId && result.profileFingerprint ? { runId: String(result.runId), materialsVersion: String(result.profileFingerprint) } : null);
      setMessage(result.search?.truncatedCalls ? `关键词较多，本轮只搜了前 ${result.search.calls} 次，还有 ${result.search.truncatedCalls} 次没打出去。` : "");
      void loadDecisions(abort.signal);
    } catch(error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "查找失败，请重试");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }, [profileId, loadDecisions]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => { void discover(true); }, 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); };
  }, [ready, discover]);
  const tiers = preference?.effectiveTiers ?? [];
  const labelOf = (tier: CompanyTier) => tierOptions.find(option => option.value === tier)?.label ?? tier;
  const saveTiers = async (next: CompanyTier[]) => {
    setTierBusy(true); setTierMessage("");
    try {
      const response = await fetch("/api/coach/jobs/tier-preference", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({tiers:next})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "偏好没有保存到云端，原设置保留");
      setPreference(result.preference); setTierBusy(false);
      await discover();
    } catch(error) {
      setTierMessage(error instanceof Error ? error.message : "偏好没有保存到云端，原设置保留");
      setTierBusy(false);
    }
  };
  const toggleTier = (tier: CompanyTier) => {
    void saveTiers(tiers.includes(tier) ? tiers.filter(value => value !== tier) : [...tiers, tier]);
  };
  // 对话里说过的意向：核对动作复用待确认事实那条路（确认 = 生效，撤回 = 不再提示）
  const reviewPendingIntent = async (action: "confirm" | "withdraw") => {
    const claimId = preference?.pending?.claimId;
    if (!claimId) return;
    setTierBusy(true); setTierMessage("");
    try {
      const response = await fetch("/api/coach/claims", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({claimId, action})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "这条意向没有核对成功，原状态保留");
      setTierBusy(false);
      await discover();
    } catch(error) {
      setTierMessage(error instanceof Error ? error.message : "这条意向没有核对成功，原状态保留");
      setTierBusy(false);
    }
  };
  const importJob = useCallback(async (job: Candidate) => {
    // 「推进」和主按钮走同一条已有的岗位分析，同一条岗在一次会话里只跑一遍
    if (imported.current.has(job.id)) return;
    imported.current.add(job.id);
    setImporting(job.id); setMessage("");
    try { await onImport(`公司：${job.company}\n岗位：${job.title}\n地点：${job.location}\n来源：${job.url}\n\n${job.description}`); }
    catch (error) { imported.current.delete(job.id); setMessage(error instanceof Error ? error.message : "岗位分析失败，可以重试"); }
    finally { setImporting(""); }
  }, [onImport]);
  /**
   * 决定只写这一条岗的一次表态：走 coach_claims 的 job_decision 命名空间，
   * 不碰目标档位那份长期偏好（那是另一条路，要用户确认才生效）。
   * 只有「我会先推进」会额外把岗位带进工作台。
   */
  const decide = async (job: Candidate, kind: JobDecisionKind, reason: string | null) => {
    if (!batch) return;
    setDecisionBusy(job.id); setDecisionError(""); setDecisionErrorFor("");
    try {
      const key=decisionEntityKey(job.url,batch.runId);
      const signature=JSON.stringify([kind,reason,batch.materialsVersion]);
      let request=decisionRequests.current.get(key);
      if(!request || request.signature!==signature){request={id:crypto.randomUUID(),signature,expectedClaimId:decisionForUrl(decisions,job.url,batch.runId)?.claimId??null};decisionRequests.current.set(key,request);}
      const response = await fetch("/api/coach/jobs/decisions", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        jobId: job.id, url: job.url, company: job.company, title: job.title, location: job.location,
        decision: kind, reason, batchRunId: batch.runId, materialsVersion: batch.materialsVersion,
        requestId:request.id,expectedClaimId:request.expectedClaimId,
      })});
      const result = await response.json();
      if (!response.ok || !result.decision?.claimId) {
        if(response.status===409){decisionRequests.current.delete(key);await loadDecisions();}
        throw Error(result.error || "决定没有保存，你之前的选择还在");
      }
      const saved = result.decision as JobDecision;
      setDecisions(items => [saved, ...items.filter(item => decisionEntityKey(item.url,item.batchRunId) !== decisionEntityKey(saved.url,saved.batchRunId))]);
      decisionRequests.current.delete(key);
      if (kind === "advance") await importJob(job);
    } catch (error) {
      setDecisionErrorFor(job.id);
      setDecisionError(error instanceof Error ? error.message : "决定没有保存，你之前的选择还在");
    } finally { setDecisionBusy(""); }
  };
  const tierSummary = !preference || preference.origin === "unset"
    ? "当前：不限（还没设过偏好）。所有公司都保留，只标注层次。"
    : tiers.length
      ? `当前：只找「${tiers.map(labelOf).join("、")}」。名录认得的公司里层次不符的会移到下面，名录没收录的一律保留。`
      : "当前：你选了「不限」。所有公司都保留，只标注层次。";
  const renderCard = (job: Candidate) => {
    const decision = batch ? decisionForUrl(decisions, job.url, batch.runId) ?? null : null;
    return <JobResultCard key={job.id} job={job} degraded={verification?.status === "degraded"} disabled={!!importing || busy}
      importing={importing === job.id} onImport={() => { void importJob(job); }}
      decision={decision} staleMaterials={!!decision && isStaleMaterials(decision, batch?.materialsVersion ?? null)}
      decisionBusy={decisionBusy === job.id} decisionError={decisionErrorFor === job.id ? decisionError : ""}
      onDecide={(kind, reason) => { void decide(job, kind, reason); }}/>;
  };
  const emptyState = zeroCandidateState({
    failedSources, filteredCount: filtered.length,
    trackedCount: search?.alreadyTracked?.length ?? 0, tierFilterActive: tiers.length > 0,
  });
  const { lead, rest, unknown } = groupCandidates(jobs);
  return <div className={discoveryStyles.discovery} aria-busy={busy}>
    <div className={discoveryStyles.header}><button className={discoveryStyles.refresh} disabled={!ready || busy || !!importing} onClick={()=>void discover()}><RefreshCw size={16}/>{busy ? "正在查找…" : "重新查找"}</button></div>
    {!ready && <p className={discoveryStyles.status}>请先保存简历和方向。</p>}
    {!!tierOptions.length && <details className={discoveryStyles.audit}>
      <summary>公司偏好 · {tiers.length?tiers.map(labelOf).join("、"):"不限"}</summary><div className={styles.tierPreference}>
      <p className={styles.tierHint}>想进哪一类公司？不选也行。</p>
      <div className={styles.tierChoices} role="group" aria-label="目标公司层次">
        <button type="button" className={styles.tierChoice} aria-pressed={!tiers.length} disabled={tierBusy || busy} onClick={()=>void saveTiers([])}>
          <span className={styles.tierDot}/>不限
        </button>
        {tierOptions.map(option=><button key={option.value} type="button" className={styles.tierChoice} aria-pressed={tiers.includes(option.value)} disabled={tierBusy || busy} onClick={()=>toggleTier(option.value)}>
          <span className={styles.tierDot}/>{option.label}
        </button>)}
      </div>
      <p className={styles.tierSummary}>{tierBusy ? "正在保存偏好…" : tierSummary}</p>
      {preference?.pending && <p className={styles.tierSummary}>你在别处说过「{preference.pending.excerpt}」，按「{preference.pending.tiers.map(labelOf).join("、")}」筛要你先点一下：<button type="button" className={styles.tierAction} disabled={tierBusy} onClick={()=>void reviewPendingIntent("confirm")}>就按这个筛</button>{' '}或{' '}<button type="button" className={styles.tierAction} disabled={tierBusy} onClick={()=>void reviewPendingIntent("withdraw")}>这不是我的意思</button>。</p>}
      {tierMessage && <p role="status">{tierMessage}</p>}
    </div></details>}
    {message && <p className={discoveryStyles.status} role="status">{message}</p>}
    <details className={discoveryStyles.audit}><summary>搜索范围与隐私说明</summary>
    <p>招聘来源只收到方向与技能关键词；AI 会结合简历评审，一次查找最多消耗 1 次 AI 额度。恢复已保存结果不重复扣费，不会自动投递。</p>
    {!!search?.sources.length && <p>
      本轮搜过：{search.keywords.join("、")}
      {search.blockedCount ? `（另有 ${search.blockedCount} 个含联系方式的词没外发）` : ""}；来源：
      {search.sources.map((source, i) => <span key={source.homepage}>{i ? "、" : ""}<a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.label}</a>（{source.coverageNote}）</span>)}。
      {search.credit}
    </p>}
    {!!search?.alreadyTracked?.length && <p className={styles.tierHint}>
      已在跟踪、本轮不再占候选位：{search.alreadyTracked.slice(0, 3).map(job => `${job.company} · ${job.title}`).join("、")}
      {search.alreadyTracked.length > 3 ? ` 等 ${search.alreadyTracked.length} 条` : ""}。
    </p>}
    {batch && <p className={styles.tierHint}>这批结论对应的材料与条件版本：{batch.materialsVersion.slice(0, 8)}；你记下的决定都挂在这一批上，换材料后会重新评审。</p>}
    {decisionError && !decisionErrorFor && <p role="status">{decisionError}</p>}
    </details>
    {verification?.note && <p role="status">{verification.note}</p>}
    {pending.length > 0 && <p role="status">简历里没读出{pending.map(field=>`「${PENDING_LABEL[field]}」`).join("、")}，这几项要求暂时筛不了；补全后同一批岗位会筛得更准。</p>}
    {busy && <div className={discoveryStyles.results} aria-label="正在读取国内岗位"><div className={discoveryStyles.skeleton}><span/><span/><span/></div><div className={discoveryStyles.skeleton}><span/><span/><span/></div></div>}
    {!busy && hasResult && !jobs.length && <div className={discoveryStyles.empty} role="status">
      <p>{emptyState.copy}</p>
      <button type="button" className={discoveryStyles.emptyAction} disabled={busy || (emptyState.action === "import_own_jd" ? !!importing : tierBusy)} onClick={() => {
        if (emptyState.action === "search_again") void discover();
        else if (emptyState.action === "relax_tiers") void saveTiers([]);
        else if (emptyState.action === "show_filtered") setShowFiltered(true);
        else onAddJob();
      }}>{emptyState.actionLabel}</button>
    </div>}
    {!!lead.length && <>
      <p className={discoveryStyles.groupTitle}>先看这 {lead.length} 条<span>依据逐条写在卡上；资格还没核实的排在后面</span></p>
      <div className={discoveryStyles.results}>{lead.map(renderCard)}</div>
      {!!rest.length && <details className={discoveryStyles.audit}>
        <summary>更多候选 {rest.length} 条</summary>
        <div className={discoveryStyles.results}>{rest.map(renderCard)}</div>
      </details>}
    </>}
    {!!unknown.length && <details className={discoveryStyles.audit}>
      <summary>资格待核实 · {unknown.length} 条</summary>
      <div className={discoveryStyles.results}>{unknown.map(renderCard)}</div>
    </details>}
    {!!filtered.length && <details className={discoveryStyles.audit} open={showFiltered}>
      <summary>另有 {filtered.length} 个岗位暂不符合已知条件</summary>
      {filtered.map(job=><p key={job.id}>{job.company} · {job.title} —— {job.reasons.join("；")}。<a href={job.url} target="_blank" rel="noopener noreferrer">原页</a></p>)}
    </details>}
  </div>;
}
