import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities, readUserTierPreference } from "@/lib/coach-harness/repository";
import { matchJobs } from "@/lib/jobs/discovery";
import { matchesRequestedSeniority, matchesRequestedSpecialty, personalizeJobs, PERSONALIZATION_VERSION } from "@/lib/jobs/personalization";
import { reserveQuota, finalizeQuota, type QuotaReservation } from "@/lib/quota";
import { LIVE_SOURCES, DOMESTIC_SOURCE_IDS, DOMESTIC_SEARCH_VERSION, searchLiveJobs, SOURCE_CREDIT, toDiscoveredJobs } from "@/lib/jobs/live-sources";
import { domesticKeywords, outboundKeywords } from "@/lib/jobs/outbound-keywords";
import { OPEN_SEARCH_SOURCE, OPEN_SEARCH_VERSION, openSearchQueries, searchOpenJobs } from "@/lib/jobs/open-search";
import { applyRetrievalGate, profileHardFields, splitSavedJobs, trackedJobUrls, RETRIEVAL_GATE_VERSION } from "@/lib/jobs/retrieval-gate";
import { applyVerificationGate } from "@/lib/jobs/verification-gate";
import { TIER_LABEL } from "@/lib/jobs/company-directory";
import { TIER_ORDER } from "@/lib/jobs/tier-intent";
import { unstable_cache } from "next/cache";
import { createHash, randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { compileContextBundle } from "@/lib/coach-harness/context";
import { beginStep, completeStep, completeTask, failTask, getTaskLedger, intakeEvent, startExecution, startTask } from "@/lib/coach-harness/run-ledger";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Two open searches + one batch read, supplemented by two keywords × two official APIs. */
const MAX_SOURCE_CALLS = 7;
const profileFingerprint = (profile: { role: string; location?: string; resumeText?: string }, tiers: string[]) =>
  createHash("sha256").update(JSON.stringify([OPEN_SEARCH_VERSION, DOMESTIC_SEARCH_VERSION, PERSONALIZATION_VERSION, RETRIEVAL_GATE_VERSION, profile.role, profile.location, profile.resumeText, [...tiers].sort()])).digest("hex");

/** 回到基础档案时读上次任务，不自动重复执行。只恢复当前资料/偏好对应的结果。 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId || !/^[\da-f-]{36}$/i.test(profileId)) return Response.json({ error: "请选择基础简历" }, { status: 400, headers });
  try {
    const profile = (await listCockpitOpportunities(user.id)).find(item => item.id === profileId && item.workspaceType === "preparation");
    if (!profile) return Response.json({ error: "找不到这份基础简历" }, { status: 404, headers });
    const db = await getDbClient();
    if (!db) throw new Error("数据库不可用");
    const { data, error } = await db.from("coach_runs").select("id")
      .eq("user_id", user.id).eq("opportunity_id", profileId).eq("action_type", "job_decision").eq("input->>billingUnit", "job_search")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ found: false }, { headers });
    const ledger = await getTaskLedger({ userId: user.id, runId: String(data.id) });
    const result = (ledger.result ?? ledger.partialResult) as { profileFingerprint?: string; jobs?: unknown[] } | null;
    const preference = await readUserTierPreference(user.id);
    if (result?.jobs && result.profileFingerprint === profileFingerprint(profile, preference.effectiveTiers)) {
      return Response.json({ found: true, result, status: ledger.status, completedAt: ledger.completedAt }, { headers });
    }
    return Response.json({ found: false, status: ledger.status, runId: ledger.runId }, { headers });
  } catch { return Response.json({ error: "上次搜索读取失败，请重试；不会自动重复搜索。" }, { status: 503, headers }); }
}

class IncompleteSearch extends Error {
  constructor(readonly result: Awaited<ReturnType<typeof searchLiveJobs>>) { super("招聘来源未完整返回"); }
}
async function readLiveJobs(keywords: string[], location: string) {
  let fetched = false;
  try {
    const result = await unstable_cache(async () => {
      fetched = true;
      const [open, official] = await Promise.all([
        searchOpenJobs(keywords, location),
        searchLiveJobs(keywords.slice(0,2), { sourceIds: DOMESTIC_SOURCE_IDS, maxCalls: 4 }),
      ]);
      const result = { postings: [...open.postings,...official.postings], failures: [...open.failures,...official.failures],
        calls: open.calls+official.calls, truncatedCalls: open.truncatedCalls+official.truncatedCalls };
      // 故障/部分结果不能被共享缓存锁住 30 分钟；当前请求仍保留可用结果。
      if (result.failures.length) throw new IncompleteSearch(result);
      return result;
    }, [OPEN_SEARCH_VERSION, DOMESTIC_SEARCH_VERSION, ...openSearchQueries(keywords,location), ...keywords], { revalidate: 1800 })();
    return { result, cacheHit: !fetched };
  } catch (error) {
    if (error instanceof IncompleteSearch) return { result: error.result, cacheHit: false };
    throw error;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({error:"请先登录"}, {status:401});
  let profileId: unknown;
  let requestId: unknown;
  try { ({ profileId, requestId } = await request.json()); } catch { return Response.json({error:"请求格式不正确"},{status:400}); }
  if (typeof profileId !== "string" || !/^[\da-f-]{36}$/i.test(profileId)) return Response.json({error:"请选择基础简历"},{status:400});
  if (requestId !== undefined && (typeof requestId !== "string" || !/^[\da-f-]{36}$/i.test(requestId))) return Response.json({error:"请求编号不正确"},{status:400});
  let runId: string | undefined;
  let reservation: QuotaReservation | null = null;
  try {
    const saved = await listCockpitOpportunities(user.id);
    const profile = saved.find(item => item.id === profileId && item.workspaceType === "preparation");
    if (!profile) return Response.json({error:"找不到这份基础简历"},{status:404});
    if (!profile.resumeText?.trim() || !profile.role?.trim()) return Response.json({error:"请先保存简历和求职方向"},{status:400});
    const resumeText = profile.resumeText;
    const tracked = trackedJobUrls(saved);
    // 出网的只有过闸的关键词：简历正文不整段外发，也不从正文抠片段拼查询。
    const outgoing = outboundKeywords({ role: profile.role, resumeText: profile.resumeText });
    const keywords = domesticKeywords(outgoing.keywords), blocked = outgoing.blocked;
    if (!keywords.length) return Response.json({error:"求职方向里没读出可搜索的关键词，把它写清楚一点（例如「AI 产品经理」）再来。"},{status:400});
    const task = await startTask({ userId: user.id, opportunityId: profileId, task: "job_decision",
      goal: "按已保存的简历与方向查找岗位", billingUnit: "job_search",
      estimate: { estimatedModelCalls: 1, maxSourceCalls: MAX_SOURCE_CALLS },
      idempotencyKey: `job-search:${profileId}:${requestId ?? randomUUID()}`,
      steps: [{ id: "search", label: "读取公开招聘来源" }, { id: "screen", label: "去重与按条件筛选" }],
      context: compileContextBundle({ userId: user.id, task: "job_decision", claims: [],
        currentInput: JSON.stringify({ profileId, keywords, location: profile.location }),
        budget: { maxModelCalls: 1, maxToolCalls: MAX_SOURCE_CALLS } }),
    });
    runId = task.runId;
    if (task.reused) {
      const ledger = await getTaskLedger({ userId: user.id, runId });
      const result = ledger.result ?? ledger.partialResult;
      return Response.json(result ?? { runId, taskStatus: ledger.status, note: "请查看任务进度，不会重复启动搜索。" },
        { status: result ? 200 : 202, headers: { "Cache-Control": "private, no-store" } });
    }
    await startExecution({ userId: user.id, runId, modelCallCount: 0 });
    await beginStep({ userId: user.id, runId, stepId: "search" });
    const { result: searched, cacheHit } = await readLiveJobs(keywords, profile.location || "");
    const checkCancelled = async () => {
      const task = await getTaskLedger({ userId: user.id, runId: runId! });
      if (task.runStatus === "cancelled" || task.runStatus === "failed") throw new Error("TASK_CANCELLED");
    };
    await checkCancelled();
    const available = toDiscoveredJobs(searched.postings);
    const sourceDescriptors = [OPEN_SEARCH_SOURCE,...LIVE_SOURCES.filter(source=>DOMESTIC_SOURCE_IDS.includes(source.id))];
    const failedSourceLabels = [...new Set(searched.failures.map(failure => [OPEN_SEARCH_SOURCE,...LIVE_SOURCES].find(source => source.id === failure.source)?.label ?? failure.source))];
    if (!available.length && searched.failures.length >= searched.calls) {
      await failTask({ userId: user.id, runId, reason: "error", failureType: "all_sources_failed", stepId: "search" });
      return Response.json({runId,error:"招聘来源暂时无法读取，请稍后重试。你的简历不受影响。"},{status:502});
    }
    await completeStep({ userId: user.id, runId, stepId: "search", resultDigest: `读取 ${available.length} 条公开岗位；失败来源 ${failedSourceLabels.length} 个` });
    await beginStep({ userId: user.id, runId, stepId: "screen" });
    const { fresh, tracked: alreadyTracked } = splitSavedJobs(available, tracked);
    // Do not truncate before hard screening: eligible jobs must not be crowded out.
    const jobs = matchJobs(fresh.filter(job=>matchesRequestedSpecialty(job,profile.role)), {role:profile.role,location:profile.location || "",resume:profile.resumeText},fresh.length);
    const seniorityExcluded = jobs.filter(job => !matchesRequestedSeniority(job, profile.role, resumeText));
    const gate = applyRetrievalGate(jobs.filter(job => matchesRequestedSeniority(job, profile.role, resumeText)), { profile: profileHardFields(resumeText) });
    gate.filtered.push(...seniorityExcluded.map(job => ({ id: job.id, company: job.company, title: job.title, location: job.location, url: job.url, publishedAt: job.publishedAt, reasons: ["你希望找初级岗位，这个岗位的职级不符合当前方向"] })));
    // 目标档位：面板点过的（含「不限」）直接生效；别处抽到的意向没确认前不拿来剔岗位
    const preference = await readUserTierPreference(user.id);
    // 公司层次仍查离线名录（这一步不额外外呼）；名录坏了不会少岗位，全部保留 + 标注未核验
    const verified = await applyVerificationGate(gate, { goalTargetTiers: preference.effectiveTiers, isoNow: new Date().toISOString() });
    if (verified.kept.length) {
      reservation = await reserveQuota(user.id,"chat",`job-personalization:${runId}`);
      if (!reservation) {
        await failTask({userId:user.id,runId,reason:"error",failureType:"personalization_quota_exhausted"});
        return Response.json({runId,error:"岗位已找到，但 AI 评审额度不足；请补充额度后重试。",needUpgrade:true},{status:403});
      }
    }
    const personalized = await personalizeJobs(verified.kept, profile.resumeText, user.id, runId, profile.role);
    await checkCancelled();
    const result = {runId, profileFingerprint:profileFingerprint(profile, preference.effectiveTiers), jobs:personalized.jobs, personalization:{version:PERSONALIZATION_VERSION,modelCalls:personalized.modelCalls,evaluatedCount:personalized.evaluatedCount}, filtered:verified.filtered, pendingProfileFields:verified.pendingProfileFields,
      verification:{status:verified.status, note:verified.note, directoryVerifiedAt:verified.directoryVerifiedAt, coverage:verified.coverage},
      tierPreference:preference, tierOptions:TIER_ORDER.map(tier=>({value:tier,label:TIER_LABEL[tier]})),
      search:{keywords, blockedCount:blocked.length, calls:searched.calls, cacheHit, callsThisRequest: cacheHit ? 0 : searched.calls, truncatedCalls:searched.truncatedCalls,
        alreadyTracked,
        credit:SOURCE_CREDIT,
        sources:sourceDescriptors.map(source=>({label:source.label, homepage:source.homepage, coverageNote:source.coverageNote})),
        candidateCompanies:[...new Set(available.map(job=>job.company))], openSearch: {enabled:true,version:OPEN_SEARCH_VERSION}},
      failedSources:failedSourceLabels,
      note:`跨公司搜索公开招聘页，索引可能滞后，在招状态请到原页核实。${alreadyTracked.length ? `${alreadyTracked.length} 条你已在跟踪，不再占候选位。` : ""}已按简历经历与JD评审，不代表录用概率。`};
    await completeStep({ userId: user.id, runId, stepId: "screen", resultDigest: `评审 ${personalized.evaluatedCount} 条，推荐 ${personalized.jobs.length} 条岗位` });
    if (searched.failures.length) await failTask({ userId: user.id, runId, reason: "error", failureType: "partial_sources_failed", partialResult: result });
    else await completeTask({ userId: user.id, runId, result, modelCallCount: personalized.modelCalls });
    await finalizeQuota(reservation,true);
    reservation=null;
    await intakeEvent({ userId: user.id, opportunityId: profileId, runId, clientEventId: `discovery_${runId}`,
      kind: searched.failures.length ? "task_partial" : "job_search_completed",
      properties: { candidate_count: personalized.jobs.length, failed_source_count: failedSourceLabels.length, cache_hit: cacheHit } })
      .catch(() => console.error("Discovery result saved but agent event was not recorded"));
    return Response.json(result,
      {headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    await finalizeQuota(reservation,false).catch(()=>console.error("Job personalization quota refund failed"));
    if (runId) {
      const task = await getTaskLedger({ userId: user.id, runId }).catch(() => null);
      if (task?.runStatus === "cancelled") return Response.json({ runId, error: "搜索已取消，简历未被改动。" }, { status: 409 });
      if (task && !["completed", "failed", "cancelled"].includes(task.runStatus)) {
        await failTask({ userId: user.id, runId, reason: "error", failureType: "search_or_save_failed" }).catch(() => undefined);
      }
    }
    console.error("Job discovery failed", error instanceof Error ? error.message : "unknown");
    return Response.json({runId,error:runId ? "岗位搜索或结果保存失败，请重试；你的简历不受影响。" : "读取简历或建立搜索任务失败，请重试"},{status:500});
  }
}
