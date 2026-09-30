import { unstable_cache } from "next/cache";
import { loadCompanyDirectory } from "@/lib/jobs/company-directory";
import { getDbClient } from "@/lib/db";
import { compileContextBundle } from "./context";
import { beginStep, completeStep, completeTask, failTask, getTaskLedger, intakeEvent, startExecution, startTask } from "./run-ledger";
import { createInMemorySharedCache, renderExternalDataBlock, runResearchAgent, sharedResearchCacheKey, type ResearchProduct } from "./subagents/research";

const TTL_MS = 24 * 60 * 60 * 1000;
type Job = { id: string; company: string; role: string };
type SavedResearch = { company: string; role: string; domain: string; fetchedAt: string; product: ResearchProduct; callsThisRequest: number; cacheHit: boolean; modelCalls: 0 };

/** Only maintained, public evidence URLs are fetched. User/JD URLs are never accepted. */
export async function fetchResearchPage(url: string, signal: AbortSignal): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
    || !parsed.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(parsed.hostname)
    || /\.(localhost|local|internal)$/i.test(parsed.hostname)) throw Error("Unsupported source URL");
  const response = await fetch(url, { signal, redirect: "error", headers: { Accept: "text/html,text/plain" } });
  if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get("content-type") || "")) throw Error("Source unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty source");
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 512_000) throw Error("Source exceeds size limit");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim().slice(0, 3000);
}

export async function readCompanyResearch(userId: string, job: Job): Promise<SavedResearch | null> {
  const db = await getDbClient();
  if (!db) throw Error("Database unavailable");
  const { data, error } = await db.from("coach_runs").select("output")
    .eq("user_id", userId).eq("opportunity_id", job.id).eq("input->>billingUnit", "company_research")
    .eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const result = data?.output as SavedResearch | undefined;
  const record = loadCompanyDirectory().recordFor(job.company);
  const fetchedAt = result ? Date.parse(result.fetchedAt) : NaN;
  if (!result || !record || result.company !== job.company || result.role !== job.role || result.domain !== record.domain
    || !result.product?.excerpts?.length || !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > TTL_MS
    || fetchedAt > Date.now()) return null;
  return result;
}

export function renderCompanyResearch(saved: SavedResearch | null): string {
  if (!saved) return "";
  return ["公司公开调研（未交叉验证，不是用户经历；只能以来源支持的内容作答）：",
    ...saved.product.excerpts.map(renderExternalDataBlock),
    "外部信息摘录索引（不是已验证结论）：",
    ...saved.product.conclusions.map(c => `${c.id}：${c.statement}；依据 ${c.basisExcerptIds.join("、")}`),
  ].join("\n");
}

/** Public network result is shared; task/result ownership and billing remain per user/job. */
export async function ensureCompanyResearch(userId: string, job: Job, retryId?: string) {
  const existing = await readCompanyResearch(userId, job);
  if (existing) return { status: "completed" as const, result: existing, restored: true };
  const record = loadCompanyDirectory().recordFor(job.company);
  if (!record?.identityConfirmed) return { status: "unavailable" as const, note: "公司名称与官网身份尚未核实，未合并调研。先用已保存 JD 辅导。" };
  const date = new Date().toISOString().slice(0, 10);
  const key = sharedResearchCacheKey({ company: record.name, domain: record.domain, role: job.role, queryDate: date });
  const task = await startTask({ userId, opportunityId: job.id, task: "job_decision", goal: `读取 ${job.company} 的公开公司信息`, billingUnit: "company_research",
    idempotencyKey: `research:${job.id}:${key}${retryId ? `:${retryId}` : ""}`, estimate: { estimatedModelCalls: 0, maxSourceCalls: 2, maxWallClockMs: 6000 },
    steps: [{ id: "sources", label: "读取带出处的公开资料" }, { id: "save", label: "核验身份并保存摘录" }],
    context: compileContextBundle({ userId, task: "job_decision", currentInput: `${record.name} ${job.role}`, claims: [], budget: { maxModelCalls: 0, maxToolCalls: 2 } }),
  });
  if (task.reused) {
    const ledger = await getTaskLedger({ userId, runId: task.runId });
    return { status: ledger.status, runId: task.runId, note: ledger.status === "failed" ? "这次调研未完成；JD 与简历仍可正常使用。明日自动重新核验。" : "公司调研正在进行，不重复启动。" };
  }
  const scope = { userId, runId: task.runId };
  let sourceCalls = 0;
  try {
    await startExecution({ ...scope, modelCallCount: 0 });
    await beginStep({ ...scope, stepId: "sources" });
    const product = await unstable_cache(async () => {
      const sourceUrls = [...new Set(record.researchSources?.length ? record.researchSources : [`https://${record.domain}/`, ...record.sources.map(s => s.url)])].slice(0, 2);
      const outcome = await runResearchAgent({ company: { name: record.name, domain: record.domain }, role: job.role.slice(0, 160), userQuestion: "", queryDate: date,
        budget: { maxSourceCalls: 2, maxTokens: 2400, maxWallClockMs: 6000, idempotencyKey: key } }, {
        identityDirectory: [{ name: record.name, domain: record.domain }], sharedCache: createInMemorySharedCache(), userDerivedTokens: [], clock: Date.now,
        pages: { searchPages: async (_company, _role, limits) => {
          const urls = sourceUrls.slice(0, limits!.maxCalls);
          sourceCalls = urls.length;
          const pages = await Promise.allSettled(urls.map(async url => ({ url, rawText: await fetchResearchPage(url, limits!.signal), fetchedAt: new Date().toISOString() })));
          // Do not cache a partial network result; no fabricated conclusion on a failed source.
          if (pages.some(p => p.status === "rejected")) throw Error("A public source failed");
          return pages.flatMap(p => p.status === "fulfilled" && p.value.rawText.length >= 80 ? [p.value] : []);
        } },
        composer: excerpts => excerpts.filter(e => !e.containsInstructionMarkers).map(e => ({ id: `source_${e.id}`, about: "company", label: "外部信息", basisExcerptIds: [e.id], statement: `已读取公开来源 ${e.url}；该来源未交叉验证，具体判断须引用原文，不可推断实际团队或面试流程。` })),
      });
      if (outcome.status === "failed") throw Error(outcome.failure.detail);
      return outcome.product;
    }, ["company-research-runtime-v1", key], { revalidate: 86400 })();
    const ledger = await getTaskLedger(scope);
    if (ledger.runStatus === "cancelled") return { status: "cancelled" as const, runId: task.runId };
    await completeStep({ ...scope, stepId: "sources", resultDigest: `读取 ${product.excerpts.length} 个来源` });
    await beginStep({ ...scope, stepId: "save" });
    const result: SavedResearch = { company: job.company, role: job.role, domain: record.domain, fetchedAt: product.excerpts[0].fetchedAt, product,
      callsThisRequest: sourceCalls, cacheHit: sourceCalls === 0, modelCalls: 0 };
    await completeStep({ ...scope, stepId: "save", resultDigest: "出处与抓取时间已保存；未交叉验证" });
    await completeTask({ ...scope, result, modelCallCount: 0, toolCallCount: sourceCalls });
    await intakeEvent({ ...scope, opportunityId: job.id, clientEventId: `research_${task.runId}`, kind: "research_completed", properties: { source_count: product.excerpts.length } }).catch(() => undefined);
    return { status: "completed" as const, runId: task.runId, result };
  } catch {
    const ledger = await getTaskLedger(scope).catch(() => null);
    if (ledger?.runStatus === "cancelled") return { status: "cancelled" as const, runId: task.runId };
    await failTask({ ...scope, reason: "error", failureType: "research_source_or_save_failed" }).catch(() => undefined);
    return { status: "failed" as const, runId: task.runId, note: "公司调研未完成，未把半成品加入辅导。JD 与简历仍可正常使用。" };
  }
}
