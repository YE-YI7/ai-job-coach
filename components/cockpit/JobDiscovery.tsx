"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { PENDING_LABEL, type HardDimension } from "@/lib/jobs/labels";
import type { FilteredJob } from "@/lib/jobs/retrieval-gate";
import type { CompanyTier } from "@/lib/coach-harness/subagents/verification";
import type { VerifiedJob } from "@/lib/jobs/verification-gate";
import styles from "./CockpitApp.module.css";
import { waitForSavedSearch } from "@/lib/jobs/search-recovery";

type Candidate = VerifiedJob & { reasons: string[] };
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
/** 出处只标站点名 + 日期，长标题留给点开看。 */
const siteOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
/** 层次结论必须可回查：已核 / 没设档位 / 身份没双校验 / 名录里没有 / 这次没核上，五种说法不一样。 */
const tierText = (job: Candidate, degraded: boolean) => {
  if (degraded) return "公司层次：这次没核验成，先全部保留。";
  switch (job.tierMatchedField) {
    case "company_tier_directory":
      return `公司层次：${job.tierLabel}（名录已核，符合你设的目标档位）。`;
    case "target_tiers_empty":
      return `公司层次：${job.tierLabel}（名录已核；当前档位是「不限」，所以只标注、不筛掉）。`;
    case "identity_unconfirmed":
      return `公司层次：${job.tierLabel ?? "名录里有同名记录"}（同名公司的身份没做双校验，先保留）。`;
    default:
      return "公司层次：名录里没有这家公司，先保留待核实。";
  }
};
export default function JobDiscovery({profileId, ready, onImport}: {
  profileId: string; ready: boolean; onImport: (sourceText: string) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<Candidate[]>([]);
  const [filtered, setFiltered] = useState<FilteredJob[]>([]);
  const [pending, setPending] = useState<HardDimension[]>([]);
  const [verification, setVerification] = useState<VerificationSummary | null>(null);
  const [search, setSearch] = useState<SearchSummary | null>(null);
  const [tierOptions, setTierOptions] = useState<TierOption[]>([]);
  const [preference, setPreference] = useState<TierPreference | null>(null);
  const [tierBusy, setTierBusy] = useState(false), [tierMessage, setTierMessage] = useState("");
  const [busy, setBusy] = useState(false), [importing, setImporting] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const discover = useCallback(async (restore = false) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage(""); setJobs([]); setFiltered([]); setPending([]); setVerification(null); setSearch(null);
    try {
      let result;
      let restored = false;
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
          result = saved.result; restored = true;
        } else if (restore && saved.found) { result = saved.result; restored = true; }
        else if (restore && ["failed", "cancelled", "partial"].includes(saved.status)) {
          setMessage("上次搜索未完成，可重新查找；不会自动重复执行。"); return;
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
      setFiltered(result.filtered ?? []);
      setPending(result.pendingProfileFields ?? []);
      setVerification(result.verification ?? null);
      setTierOptions(result.tierOptions ?? []);
      setPreference(result.tierPreference ?? null);
      setSearch(result.search ?? null);
      setMessage([restored ? "已恢复上次保存的结果；要查最新岗位可点「重新查找岗位」。" : "", result.jobs.length ? "找到这些候选，先看来源，再决定是否分析。" : `这次按「${(result.search?.keywords ?? []).join("、")}」搜到的公开岗位里，没有符合方向和城市的。不代表其他公司没有机会，可以调整方向或导入你找到的 JD。`,
        result.failedSources?.length ? `${result.failedSources.join("、")} 暂时没读到，结果不完整。` : "",
        result.search?.truncatedCalls ? `关键词较多，本轮只搜了前 ${result.search.calls} 次，还有 ${result.search.truncatedCalls} 次没打出去。` : ""]
        .filter(Boolean).join(" "));
    } catch(error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "查找失败，请重试");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }, [profileId]);
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
  const tierSummary = !preference || preference.origin === "unset"
    ? "当前：不限（还没设过偏好）。所有公司都保留，只标注层次。"
    : tiers.length
      ? `当前：只找「${tiers.map(labelOf).join("、")}」。名录认得的公司里层次不符的会移到下面，名录没收录的一律保留。`
      : "当前：你选了「不限」。所有公司都保留，只标注层次。";
  return <div className={styles.jobDiscovery}>
    <button className={styles.primaryButton} disabled={!ready || busy || !!importing} onClick={()=>void discover()}>{busy ? "正在读取岗位…" : "重新查找岗位"}</button>
    <p>{ready ? "按你保存的求职方向上网搜公开岗位接口，再按城市、JD 写明的年限/学历门槛硬筛，并对照离线名录标注公司层次。出网的只有过闸的关键词，简历不外发；这一步不消耗模型额度。" : "先保存简历和方向，再找岗位。"}</p>
    {!!tierOptions.length && <div className={styles.tierPreference}>
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
    </div>}
    {message && <p role="status">{message}</p>}
    {!!search?.sources.length && <p className={styles.tierHint}>
      本轮搜过：{search.keywords.join("、")}
      {search.blockedCount ? `（另有 ${search.blockedCount} 个含联系方式的词没外发）` : ""}；来源：
      {search.sources.map((source, i) => <span key={source.homepage}>{i ? "、" : ""}<a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.label}</a>（{source.coverageNote}）</span>)}。
      {search.credit}
    </p>}
    {!!search?.alreadyTracked?.length && <p className={styles.tierHint}>
      已在跟踪、本轮不再占候选位：{search.alreadyTracked.slice(0, 3).map(job => `${job.company} · ${job.title}`).join("、")}
      {search.alreadyTracked.length > 3 ? ` 等 ${search.alreadyTracked.length} 条` : ""}。
    </p>}
    {verification?.note && <p role="status">{verification.note}</p>}
    {pending.length > 0 && <p role="status">简历里没读出{pending.map(field=>`「${PENDING_LABEL[field]}」`).join("、")}，这几项要求暂时筛不了；补全后同一批岗位会筛得更准。</p>}
    {jobs.map(job=><article key={job.id} className={styles.discoveredJob}>
      <div><h3>{job.title}</h3><p>{job.company} · {job.location || "地点未注明"}</p></div>
      <p>{job.reasons.join("；")}。这是关键词初筛，不是能力匹配结论。</p>
      <p>{tierText(job, verification?.status === "degraded")}</p>
      {!!job.tierSources.length && <p>{job.tierBasis}（出处：{job.tierSources.map((source,i)=><span key={source.url}>{i ? "、" : ""}<a href={source.url} target="_blank" rel="noopener noreferrer">{siteOf(source.url)}{source.publishedAt ? ` ${source.publishedAt}` : ""}</a></span>)}）</p>}
      {!!job.jdRequirements.length && <p>JD 硬门槛：{job.jdRequirements.map(r=>r.label).join("、")}。</p>}
      <small>{job.freshness === "in_sale" ? "近 30 天内发布的布告" : "发布超过 30 天或没有发布日期，是否仍在招聘待核实"} · 来源读取于 {new Date(job.checkedAt).toLocaleString("zh-CN")}</small>
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
    {!!filtered.length && <div>
      <p>{filtered.length} 个岗位因 JD 硬门槛或公司层次对不上未列入上面，仍可查看：</p>
      {filtered.map(job=><p key={job.id}>{job.company} · {job.title} —— {job.reasons.join("；")}。<a href={job.url} target="_blank" rel="noopener noreferrer">原页</a></p>)}
    </div>}
    {!!jobs.length && <p>上网搜岗位时出网的只有过闸的关键词，你的简历不发出去；不会自动投递，也不会向招聘网站提交任何东西。</p>}
  </div>;
}
