/**
 * 检索子 Agent（job-search）。PRD 契约表第一行：
 * 输入 = 关键词组 + 硬指标（地点/年限/学历）+ 用户目标；
 * 输出 = 候选岗位列表，每条带来源 URL、抓取时间、去重键、命中字段与理由。
 *
 * 确定性部分全部在这里落地、全部可单测（§0.3：判定不等于事实，硬筛不走模型）：
 *   FR-6  硬筛（地点/年限/学历）纯代码，结果集合唯一确定；
 *   FR-8  关键词生成前剥离 PII（姓名/电话/公司+人名组合）；
 *   FR-10 去重键：同一岗位跨关键词只出现一次，与库里已有岗位比对不重复建；
 *   FR-11 时效：超过 TTL 或缺布告时间的一律「待核实」，绝不写「在售」；
 *   FR-16 抓取内容只是数据：本文件不渲染任何 prompt 文本，原始页面文本
 *         只能以 VerbatimDataBlock 形态存在（见 research.ts 的同一个包装器）。
 *
 * 不触网、不调模型：岗位源是注入接口，测试用假源。
 */
import { createHash } from "node:crypto";
import { estimateTokens } from "../context";
import {
  assertStructuredInput,
  createInMemoryIdempotencyStore,
  quoteWithinBudget,
  type BudgetSpec,
  type FanOutQuote,
  type IdempotencyStore,
  type SourcePointer,
  type SubAgentOutcome,
  type UsageMeter,
} from "./contract";

/* ------------------------------ 输入 ------------------------------ */

export type EducationLevel = "high_school" | "associate" | "bachelor" | "master" | "phd";

/** 硬指标：JD 侧的要求值。缺省 = 不设限（不做无依据的剔除）。 */
export interface HardRequirement {
  location?: string;
  remote?: boolean;
  yearsMin?: number;
  educationMin?: EducationLevel;
}

/** 硬指标：用户档案侧的实际值。缺字段不阻断（FR-5），转「待补」保留。 */
export interface ProfileHardFields {
  city?: string;
  openToRemote?: boolean;
  yearsExperience?: number;
  education?: EducationLevel;
}

export interface UserGoal {
  roleTitle: string;
  targetLocations: string[];
  /** 只作软匹配依据，不参与硬筛。 */
  notes?: string;
}

export interface RetrievalInput {
  keywords: string[];
  hard: HardRequirement;
  profile: ProfileHardFields;
  goal: UserGoal;
  budget: BudgetSpec;
}

/* ---------------------------- 硬筛 FR-6 ---------------------------- */

export type HardFilterVerdict = "keep" | "drop" | "keep_pending_profile";

export interface HardFilterResult {
  verdict: HardFilterVerdict;
  /** 逐维度轨迹：判定过程本身可复核，结果集合才可复现。 */
  trace: Array<{ dimension: "location" | "years" | "education"; outcome: "pass" | "fail" | "no_requirement" | "profile_missing"; detail: string }>;
}

const EDUCATION_RANK: Record<EducationLevel, number> = {
  high_school: 1,
  associate: 2,
  bachelor: 3,
  master: 4,
  phd: 5,
};

/**
 * 纯函数、全覆盖判定：JD 要求 × 档案实际 → keep / drop / keep_pending_profile。
 * 规则顺序固定（地点→年限→学历），任何一条 fail 即 drop；
 * 无 fail 且有 profile_missing 即 keep_pending_profile（保留 + 标注待补）。
 */
export function hardFilter(jd: HardRequirement, profile: ProfileHardFields): HardFilterResult {
  const trace: HardFilterResult["trace"] = [];

  if (jd.remote === true) {
    trace.push({ dimension: "location", outcome: "no_requirement", detail: "JD 接受远程，地点不设限" });
  } else if (jd.location === undefined) {
    trace.push({ dimension: "location", outcome: "no_requirement", detail: "JD 未写地点，不据此剔除" });
  } else if (profile.city === undefined) {
    trace.push({ dimension: "location", outcome: "profile_missing", detail: "档案缺城市，保留待补" });
  } else if (profile.city === jd.location) {
    trace.push({ dimension: "location", outcome: "pass", detail: `档案城市 ${profile.city} 命中 JD 地点 ${jd.location}` });
  } else {
    trace.push({ dimension: "location", outcome: "fail", detail: `档案城市 ${profile.city} ≠ JD 地点 ${jd.location} 且不接受远程` });
  }

  if (jd.yearsMin === undefined) {
    trace.push({ dimension: "years", outcome: "no_requirement", detail: "JD 未写年限下限" });
  } else if (profile.yearsExperience === undefined) {
    trace.push({ dimension: "years", outcome: "profile_missing", detail: "档案缺工作年限，保留待补" });
  } else if (profile.yearsExperience >= jd.yearsMin) {
    trace.push({ dimension: "years", outcome: "pass", detail: `档案 ${profile.yearsExperience} 年 ≥ JD 下限 ${jd.yearsMin} 年` });
  } else {
    trace.push({ dimension: "years", outcome: "fail", detail: `档案 ${profile.yearsExperience} 年 < JD 下限 ${jd.yearsMin} 年` });
  }

  if (jd.educationMin === undefined) {
    trace.push({ dimension: "education", outcome: "no_requirement", detail: "JD 未写学历下限" });
  } else if (profile.education === undefined) {
    trace.push({ dimension: "education", outcome: "profile_missing", detail: "档案缺学历，保留待补" });
  } else if (EDUCATION_RANK[profile.education] >= EDUCATION_RANK[jd.educationMin]) {
    trace.push({ dimension: "education", outcome: "pass", detail: `档案学历 ${profile.education} ≥ 要求 ${jd.educationMin}` });
  } else {
    trace.push({ dimension: "education", outcome: "fail", detail: `档案学历 ${profile.education} < 要求 ${jd.educationMin}` });
  }

  const anyFail = trace.some((t) => t.outcome === "fail");
  const anyMissing = trace.some((t) => t.outcome === "profile_missing");
  return { verdict: anyFail ? "drop" : anyMissing ? "keep_pending_profile" : "keep", trace };
}

/* ---------------------------- PII 剥离 FR-8 ---------------------------- */

export interface PiiBits {
  /** 自然人姓名（中英皆可）；按整词剥离。 */
  names: string[];
  /** 公司名；与人名相邻的组合整体剥离（「字节的小李」→ 剥离）。 */
  companies: string[];
}

const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ID_LIKE_RE = /(?<!\d)\d{15,18}[Xx]?(?!\d)/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 姓名出现在公司语境里 → 连同连接词一起剥（「XX公司的张三」→「XX公司的」）。 */
function stripCompanyPersonCombos(text: string, pii: PiiBits): string {
  let out = text;
  for (const company of pii.companies) {
    for (const name of pii.names) {
      const combo = new RegExp(
        `${escapeRe(company)}\\s*(?:的|员工|前|现)?\\s*${escapeRe(name)}|(?:@|在)\\s*${escapeRe(company)}\\s*的?\\s*${escapeRe(name)}`,
        "g",
      );
      out = out.replace(combo, "");
    }
  }
  return out;
}

/** 剥电话/邮箱/证件号 + 公司人名组合 + 独立姓名。剥离动作发生在任何关键词生成之前。 */
export function stripPii(text: string, pii: PiiBits): string {
  let out = text.replace(PHONE_RE, "").replace(EMAIL_RE, "").replace(ID_LIKE_RE, "");
  out = stripCompanyPersonCombos(out, pii);
  for (const name of [...pii.names].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRe(name), "g"), "");
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** 剥离后仍带 PII 的候选词直接丢弃——第二道机械闸，不指望剥离万无一失。 */
const PHONE_RE_STATELESS = new RegExp(PHONE_RE.source);
const EMAIL_RE_STATELESS = new RegExp(EMAIL_RE.source);

export function containsPii(token: string, pii: PiiBits): boolean {
  if (PHONE_RE_STATELESS.test(token) || EMAIL_RE_STATELESS.test(token)) return true;
  if (pii.names.some((n) => token.includes(n))) return true;
  return pii.companies.some((c) => token.includes(c) && pii.names.some((n) => token.includes(n)));
}

export interface KeywordSource {
  roleTitle: string;
  skills: string[];
  /** 简历/档案自由文本；生成关键词前必过 stripPii。 */
  profileText?: string;
  pii: PiiBits;
}

export const MAX_KEYWORDS = 8;

/** 关键词 = 岗位名 + 技能词 + 剥离后的自由文本片段；产出条数封顶（扇出预算）。 */
export function buildSearchKeywords(src: KeywordSource): string[] {
  const cleaned = src.profileText ? stripPii(src.profileText, src.pii) : "";
  const fragments = cleaned
    .split(/[、,，;；.\n|/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 20);
  const candidates = [src.roleTitle, ...src.skills, ...fragments]
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !containsPii(s, src.pii));
  return [...new Set(candidates)].slice(0, MAX_KEYWORDS);
}

/* ---------------------- 去重键与时效 FR-10/11 ---------------------- */

function normalizeToken(s: string): string {
  let out = s.toLowerCase().replace(/\s+/g, "");
  // 循环剥后缀，「字节科技有限公司」与「字节科技」归一到同一个词。
  const suffix = /(有限公司|股份有限公司|集团|科技|技术)$/;
  while (out.length > 2 && suffix.test(out)) out = out.replace(suffix, "");
  return out;
}

/**
 * 去重键：公司 + 岗位 + 城市 归一后哈希。
 * 同一岗位跨关键词命中多次 → 键相同，只留首见（首见按关键词顺序，确定性）。
 */
export function jobDedupeKey(input: { company: string; title: string; location: string }): string {
  const canonical = JSON.stringify([
    normalizeToken(input.company),
    normalizeToken(input.title),
    normalizeToken(input.location),
  ]);
  return `jk_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/** FR-11：TTL 之内且有布告时间才允许 in_sale；过期/缺时间一律「待核实」。 */
export const JOB_TTL_DAYS = 30;
export type Freshness = "in_sale" | "待核实";

export function freshnessLabel(postedAtIso: string | null | undefined, nowMs: number): Freshness {
  if (!postedAtIso) return "待核实";
  const posted = Date.parse(postedAtIso);
  if (!Number.isFinite(posted)) return "待核实";
  const age = nowMs - posted;
  return Number.isFinite(age) && age >= 0 && age <= JOB_TTL_DAYS * 24 * 60 * 60 * 1000 ? "in_sale" : "待核实";
}

/* ------------------------- 数据源（注入） ------------------------- */

export interface RawJobPosting {
  sourceId: string;
  url: string;
  company: string;
  companyDomain?: string;
  title: string;
  location: string;
  remote?: boolean;
  yearsMin?: number;
  educationMin?: EducationLevel;
  postedAt?: string | null;
  fetchedAt: string;
  /** 页面原文永远按数据处理；本包不渲染它，只透传包装块。 */
  rawPageText?: string;
}

export interface JobSource {
  searchByKeyword(keyword: string, options?: { signal: AbortSignal }): Promise<RawJobPosting[]>;
}

/* ------------------------------ 产物 ------------------------------ */

export interface ScoredJob {
  dedupeKey: string;
  url: string;
  fetchedAt: string;
  postedAt: string | null;
  company: string;
  title: string;
  location: string;
  freshness: Freshness;
  hardVerdict: "keep" | "keep_pending_profile";
  pendingProfileFields: string[];
  /** 每条结论都要有指针：检索结论的来源 = 外部抓取，一律 untrusted。 */
  source: SourcePointer;
  /** 软匹配（为什么给你）：命中字段 + 理由，缺一项就不构成本产物。 */
  soft: Array<{ matchedField: string; reason: string; label: "外部信息" }>;
}

export interface RetrievalProduct {
  jobs: ScoredJob[];
  dropped: Array<{ dedupeKey: string; ruleId: "hard_filter"; trace: HardFilterResult["trace"] }>;
  withheldExistingKeys: string[];
  quote: FanOutQuote;
  /** 空集合的可出口话术（ok 但空 ≠ failed：搜到了但都不合适，说人话）。 */
  userCopy: string | null;
}

export const RETRIEVAL_FAILURE_COPY = "外面暂时搜不到合适的，先按你粘的 JD 辅导。";
/**
 * 事前报价用的每次源调用假设值：报价发生在取数之前，只能给假设。
 * 事后计量不走这里，走 `estimateTokens`（真实文本，唯一口径）。
 */
const PER_CALL_QUOTE_TOKENS = 600;
const PER_CALL_WALL_CLOCK_ESTIMATE_MS = 1500;

/** 这一轮从源里真读进来的文本：标题 + 地点 + 链接 + 页面正文（有则算）。 */
function payloadTokens(postings: RawJobPosting[]): number {
  return postings.reduce((sum, p) => sum + estimateTokens(`${p.title}${p.location}${p.url}${p.rawPageText ?? ""}`), 0);
}

export function quoteRetrievalFanOut(input: RetrievalInput): FanOutQuote {
  const calls = input.keywords.length;
  return {
    billingUnits: 1,
    plannedSourceCalls: calls,
    estimatedTokens: calls * PER_CALL_QUOTE_TOKENS,
    estimatedWallClockMs: calls * PER_CALL_WALL_CLOCK_ESTIMATE_MS,
    rationale: `一次岗位搜索任务 = 1 个计费单元；扇出 = ${calls} 个关键词 × 1 次源调用`,
  };
}

export interface RetrievalDeps {
  source: JobSource;
  /** 库里已有岗位的去重键集合：比对不重复建（FR-10 后半句）。 */
  existingKeys?: Set<string>;
  /** 注入时钟：假源每次被调可推进它，墙钟判定才可测。 */
  clock: () => number;
  idempotency?: IdempotencyStore<SubAgentOutcome<RetrievalProduct>>;
}

function meter(budget: BudgetSpec, sourceCalls: number, tokens: number, startedMs: number, nowMs: number): UsageMeter {
  return {
    billingUnits: 1,
    sourceCalls,
    tokens,
    wallClockMs: nowMs - startedMs,
    budget,
  };
}

export async function runRetrievalAgent(input: RetrievalInput, deps: RetrievalDeps): Promise<SubAgentOutcome<RetrievalProduct>> {
  assertStructuredInput(input);
  const store = deps.idempotency ?? createInMemoryIdempotencyStore<SubAgentOutcome<RetrievalProduct>>();
  const cached = store.get(input.budget.idempotencyKey);
  if (cached) return cached;

  const quote = quoteRetrievalFanOut(input);
  if (!quoteWithinBudget(quote, input.budget)) {
    const failed: SubAgentOutcome<RetrievalProduct> = {
      status: "failed",
      idempotencyKey: input.budget.idempotencyKey,
      usage: meter(input.budget, 0, 0, deps.clock(), deps.clock()),
      failure: {
        reason: "budget_exhausted",
        userCopy: RETRIEVAL_FAILURE_COPY,
        partialWithheld: false,
        detail: `事前报价超预算：${quote.plannedSourceCalls} 次源调用 / ${quote.estimatedTokens} token，上限 ${input.budget.maxSourceCalls} 次 / ${input.budget.maxTokens} token`,
      },
    };
    store.set(input.budget.idempotencyKey, failed);
    return failed;
  }

  const started = deps.clock();
  const referenceNow = started;
  const seenKeys = new Set<string>();
  const jobs: ScoredJob[] = [];
  const dropped: RetrievalProduct["dropped"] = [];
  const withheldExistingKeys: string[] = [];
  let sourceCalls = 0;
  let pulledTokens = 0;

  try {
    for (const keyword of input.keywords) {
      if (sourceCalls >= input.budget.maxSourceCalls) throw new Error("__budget_exhausted__");
      const remaining = input.budget.maxWallClockMs - (deps.clock() - started);
      if (remaining <= 0) throw new Error("__wall_clock_timeout__");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      sourceCalls += 1;
      let postings: RawJobPosting[];
      try {
        postings = await Promise.race([
          deps.source.searchByKeyword(keyword, { signal: controller.signal }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => {
            controller.abort(); reject(new Error("__wall_clock_timeout__"));
          }, remaining); }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
      pulledTokens += payloadTokens(postings);
      if (pulledTokens > input.budget.maxTokens) throw new Error("__budget_exhausted__");
      if (deps.clock() - started > input.budget.maxWallClockMs) throw new Error("__wall_clock_timeout__");
      for (const posting of postings) {
        const key = jobDedupeKey(posting);
        if (seenKeys.has(key)) continue; // 跨关键词只出现一次
        seenKeys.add(key);
        if (deps.existingKeys?.has(key)) {
          withheldExistingKeys.push(key); // 与库里已有岗位比对不重复建
          continue;
        }
        const filter = hardFilter(
          {
            location: posting.location,
            remote: posting.remote,
            yearsMin: posting.yearsMin,
            educationMin: posting.educationMin,
          },
          input.profile,
        );
        if (filter.verdict === "drop") {
          dropped.push({ dedupeKey: key, ruleId: "hard_filter", trace: filter.trace });
          continue;
        }
        jobs.push({
          dedupeKey: key,
          url: posting.url,
          fetchedAt: posting.fetchedAt,
          postedAt: posting.postedAt ?? null,
          company: posting.company,
          title: posting.title,
          location: posting.location,
          freshness: freshnessLabel(posting.postedAt, referenceNow),
          hardVerdict: filter.verdict,
          pendingProfileFields: filter.trace.filter((t) => t.outcome === "profile_missing").map((t) => t.dimension),
          source: { kind: "external", url: posting.url, fetchedAt: posting.fetchedAt, trust: "untrusted" },
          soft: [{ matchedField: "keyword", reason: `由关键词「${keyword}」命中`, label: "外部信息" }],
        });
      }
    }
  } catch (error) {
    const isBudget = error instanceof Error && error.message === "__budget_exhausted__";
    const isTimeout = error instanceof Error && error.message === "__wall_clock_timeout__";
    const failed: SubAgentOutcome<RetrievalProduct> = {
      status: "failed",
      idempotencyKey: input.budget.idempotencyKey,
      // 失败分支只有计量，没有 product：已经攒到的 jobs 就地扣下。
      usage: meter(input.budget, sourceCalls, pulledTokens, started, deps.clock()),
      failure: {
        reason: isBudget ? "budget_exhausted" : isTimeout ? "wall_clock_timeout" : "source_error",
        userCopy: RETRIEVAL_FAILURE_COPY,
        partialWithheld: jobs.length > 0,
        detail: isBudget ? "实际正文或扇出超预算，中途停跑" : isTimeout ? "墙钟耗尽，停止后续源调用" : `数据源异常：${String(error)}`,
      },
    };
    store.set(input.budget.idempotencyKey, failed);
    return failed;
  }

  const usage = meter(input.budget, sourceCalls, pulledTokens, started, deps.clock());
  if (usage.wallClockMs > input.budget.maxWallClockMs) {
    const failed: SubAgentOutcome<RetrievalProduct> = {
      status: "failed",
      idempotencyKey: input.budget.idempotencyKey,
      usage,
      failure: {
        reason: "wall_clock_timeout",
        userCopy: RETRIEVAL_FAILURE_COPY,
        partialWithheld: jobs.length > 0,
        detail: `墙钟 ${usage.wallClockMs}ms 超上限 ${input.budget.maxWallClockMs}ms`,
      },
    };
    store.set(input.budget.idempotencyKey, failed);
    return failed;
  }

  const product: RetrievalProduct = {
    jobs,
    dropped,
    withheldExistingKeys,
    quote,
    userCopy: jobs.length === 0 ? RETRIEVAL_FAILURE_COPY : null,
  };
  const outcome: SubAgentOutcome<RetrievalProduct> = {
    status: "ok",
    idempotencyKey: input.budget.idempotencyKey,
    usage,
    product,
  };
  store.set(input.budget.idempotencyKey, outcome);
  return outcome;
}
