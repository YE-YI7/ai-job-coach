/**
 * 找岗位链路的硬筛适配器（M4 第一片，只读）。
 *
 * 只做三件已被 `lib/coach-harness/subagents/retrieval.ts` 测试覆盖的判定，
 * 把公开招聘板取回的文本喂进去：
 * - FR-10 去重键：同一岗位跨来源/跨重复布告只出现一次；
 * - FR-10 后半 库里比对：用户已经跟踪的岗位不再占候选位（`splitSavedJobs`）；
 * - FR-11 时效：超 TTL 或没有布告时间一律「待核实」，不写在售；
 * - FR-6/FR-5 硬筛：只判「经验年限」和「学历」两条能从原文可靠抽出的维度，
 *   地点仍由 `matchJobs` 负责（那边已有中英城市归一，这里不做第二套）。
 *
 * 抽不出要求就不设限（`no_requirement`），档案缺字段就保留 + 标注待补，
 * 两条合起来保证「不会因为解析不出来而悄悄少岗位」。
 */
import {
  freshnessLabel,
  hardFilter,
  jobDedupeKey,
  type EducationLevel,
  type Freshness,
  type HardRequirement,
  type ProfileHardFields,
} from "@/lib/coach-harness/subagents/retrieval";
import type { DiscoveredJob } from "./discovery";

import type { HardDimension } from "./labels";
export type { HardDimension } from "./labels";
export { PENDING_LABEL } from "./labels";

export interface JdRequirement {
  dimension: HardDimension;
  /** 给人看的门槛，如「经验 ≥ 5 年」「学历 ≥ 本科」。 */
  label: string;
  /** JD 原文片段：判定必须能被回查。 */
  evidence: string;
}

/** `matchJobs` 的产物：公开招聘板条目 + 给用户看的初筛理由。 */
export type MatchedJob = DiscoveredJob & { reasons: string[] };

export interface GatedJob extends MatchedJob {
  dedupeKey: string;
  freshness: Freshness;
  hardVerdict: "keep" | "keep_pending_profile";
  /** 档案里缺哪几项，导致这一条只标注不剔除。 */
  pendingProfileFields: HardDimension[];
  jdRequirements: JdRequirement[];
}

export interface FilteredJob {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  publishedAt: string | null;
  /** 逐维度轨迹里 fail 的那些条，原样给用户看。 */
  reasons: string[];
}

export interface RetrievalGateResult {
  kept: GatedJob[];
  filtered: FilteredJob[];
  /** 跨整个结果集汇总：档案补这几项，筛选才会真正生效。 */
  pendingProfileFields: HardDimension[];
}

/* ------------------------- JD 侧要求抽取 ------------------------- */

/** 软性表述所在窗口不作硬门槛：「硕士优先」的门槛仍是本科。 */
const SOFT = /preferred|nice to have|not required|a plus|bonus|ideally|or equivalent|优先|加分|不限|均可/i;
const REQUIRE_MARK = /require|minim|at least|must have|you (?:have|bring)|经验要求|要求|至少/i;

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function toNumber(token: string): number {
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  if (token in CN_NUM) return CN_NUM[token];
  if (/^十[一二三四五六七八九]?$/.test(token)) return 10 + (CN_NUM[token[1]] ?? 0);
  return NaN;
}

/**
 * 按「分句」判定，不按滑动窗口：证据 = 命中所在那一句，软性标记也只看那一句。
 * 窗口法会把后半句的「硕士优先」泼到前半句的「本科及以上」上，把真门槛误判成没有门槛。
 */
interface Clause {
  start: number;
  end: number;
  text: string;
}
const CLAUSE_STOP = /[,，.。;；!\n！?]/;

function clausesOf(text: string): Clause[] {
  const out: Clause[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!CLAUSE_STOP.test(text[i])) continue;
    const chunk = text.slice(start, i).replace(/\s+/g, " ").trim();
    if (chunk) out.push({ start, end: i + 1, text: chunk.slice(0, 80) });
    start = i + 1;
  }
  const tail = text.slice(start).replace(/\s+/g, " ").trim();
  if (tail) out.push({ start, end: text.length, text: tail.slice(0, 80) });
  return out;
}

/** 命中点属于哪一句；返回 [句子原文, 是否软性表述]。 */
function clauseAt(list: Clause[], index: number): { text: string; soft: boolean } {
  const clause = list.find((c) => index >= c.start && index < c.end);
  const text = clause?.text ?? "";
  return { text, soft: SOFT.test(text) };
}

const YEARS_PATTERNS: RegExp[] = [
  // 5+ years of product management experience / 3-5 years experience / 2 yrs of experience
  /\b(\d{1,2}(?:\.\d)?)\s*(?:\+|以上)?\s*(?:[-–~]\s*\d{1,2}(?:\.\d)?)?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[a-z][a-z\-]*\s+){0,4}experience\b/gi,
  // experience: 5 years / experience of 3+ years
  /\bexperience\s*(?:\(|\[)?\s*(?:of|:)?\s*(\d{1,2}(?:\.\d)?)\s*(?:\+|以上)?\s*(?:years?|yrs?|年)/gi,
  // 5 年以上相关工作经验 / 3年经验 / 三年以上从业经历
  // `(?<!\d)` 防止从「2024年」这类日期里回溯截出 24 年假门槛
  /(?<![\d.])(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*年(?:以上|\+)?(?:的)?[^。；;\n\d]{0,8}?(?:经验|经历)/g,
  // 3-5 年经验：门槛是 3 年
  /(?<![\d.])(\d{1,2})\s*[-–~]\s*\d{1,2}\s*年[^。；;\n\d]{0,8}?(?:经验|经历)/g,
];
/** 没有「experience」字样的裸写法（"5+ years"）只在要求句里采信。 */
const BARE_YEARS = /(?<![\d.])(\d{1,2})\s*\+\s*(?:years?|yrs?)\b/gi;
/** 区间取下限：「3-5 年」的门槛是 3 年。 */
const YEAR_RANGE = /(\d{1,2}(?:\.\d)?)\s*[-–~]\s*\d{1,2}(?:\.\d)?\s*(?:年|years?|yrs?)/i;

/**
 * 学位词。中文词不能套 `\b`（CJK 在 JS 里不是 `\w`，加了边界反而匹配不上），
 * 所以中英分开写；`B.S./M.S.` 这类缩写一律不收——`Ms.` 这种词会误判成硕士，
 * 宁可解析不出来（不剔除）也不要造出一个假门槛。
 */
const DEGREES: Array<{ re: RegExp; level: EducationLevel; label: string }> = [
  { re: /\b(?:phd|ph\.d\.?|doctorate|doctoral)\b/gi, level: "phd", label: "博士" },
  { re: /博士/g, level: "phd", label: "博士" },
  { re: /\b(?:master(?:'s)?|mba)\b/gi, level: "master", label: "硕士" },
  { re: /(?:硕士|研究生)/g, level: "master", label: "硕士" },
  { re: /\b(?:bachelor(?:'s)?|undergraduate)\b/gi, level: "bachelor", label: "本科" },
  { re: /本科/g, level: "bachelor", label: "本科" },
  { re: /\bassociate(?:'s)?\s+degree\b/gi, level: "associate", label: "大专" },
  { re: /(?:大专|专科)/g, level: "associate", label: "大专" },
];
const DEGREE_RANK: Record<EducationLevel, number> = { high_school: 1, associate: 2, bachelor: 3, master: 4, phd: 5 };

function extractYears(text: string, clauses: Clause[]): { min: number; evidence: string } | null {
  const hits: Array<{ min: number; evidence: string }> = [];
  const push = (m: RegExpExecArray | RegExpMatchArray, pattern: RegExp) => {
    const clause = clauseAt(clauses, m.index ?? 0);
    if (clause.soft) return;
    if (pattern === BARE_YEARS && !REQUIRE_MARK.test(clause.text)) return;
    const range = YEAR_RANGE.exec(m[0]);
    const value = toNumber(range ? range[1] : (m[1] ?? ""));
    if (Number.isFinite(value) && value > 0 && value <= 30) hits.push({ min: value, evidence: clause.text });
  };
  for (const pattern of YEARS_PATTERNS) for (const m of text.matchAll(pattern)) push(m, pattern);
  for (const m of text.matchAll(BARE_YEARS)) push(m, BARE_YEARS);
  if (!hits.length) return null;
  // 取最低门槛：多处出现时按对用户最宽松的那条算。
  return hits.reduce((lo, h) => (h.min < lo.min ? h : lo), hits[0]);
}

interface DegreeHit {
  level: EducationLevel;
  label: string;
  evidence: string;
  soft: boolean;
}

function degreeHits(text: string, clauses: Clause[]): DegreeHit[] {
  const hits: DegreeHit[] = [];
  for (const { re, level, label } of DEGREES) {
    for (const m of text.matchAll(re)) {
      const clause = clauseAt(clauses, m.index ?? 0);
      hits.push({ level, label, evidence: clause.text, soft: clause.soft });
    }
  }
  return hits;
}

function extractEducation(text: string, clauses: Clause[]): { level: EducationLevel; label: string; evidence: string } | null {
  const hard = degreeHits(text, clauses).filter((h) => !h.soft);
  if (!hard.length) return null;
  // 取最低门槛：「本科及以上，硕士优先」门槛是本科。
  return hard.reduce((lo, h) => (DEGREE_RANK[h.level] < DEGREE_RANK[lo.level] ? h : lo), hard[0]);
}

/** JD 全文 → 硬指标 + 可回查证据。抽不出来就留空，绝不据此剔除。 */
export function jdHardRequirements(jdText: string): { hard: HardRequirement; requirements: JdRequirement[] } {
  const clauses = clausesOf(jdText);
  const requirements: JdRequirement[] = [];
  const hard: HardRequirement = {};
  const years = extractYears(jdText, clauses);
  if (years) {
    hard.yearsMin = years.min;
    requirements.push({ dimension: "years", label: `经验 ≥ ${years.min} 年`, evidence: years.evidence });
  }
  const edu = extractEducation(jdText, clauses);
  if (edu) {
    hard.educationMin = edu.level;
    requirements.push({ dimension: "education", label: `学历 ≥ ${edu.label}`, evidence: edu.evidence });
  }
  return { hard, requirements };
}

/* ------------------------- 档案侧硬指标 ------------------------- */

/** 只认「N 年经验」这类自述，不拿简历里的日期区间倒推年限（`(?<![\d.])` 挡住「2024年工作」截出 24）。 */
const RESUME_YEARS =
  /(?<![\d.])(\d{1,2}(?:\.\d)?)\s*(?:\+|以上)?\s*年(?:的)?[^。；;\n\d]{0,8}?(?:经验|经历|工作)|\b(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[a-z][a-z\-]*\s+){0,4}experience\b/gi;

/** 简历文本 → 档案硬指标；缺哪一项就不填（缺项走「待补」，不阻断）。 */
export function profileHardFields(resumeText: string): ProfileHardFields {
  const profile: ProfileHardFields = {};
  const clauses = clausesOf(resumeText);
  let years = 0;
  for (const m of resumeText.matchAll(RESUME_YEARS)) {
    const value = toNumber(m[1] ?? m[2] ?? "");
    if (Number.isFinite(value) && value > 0 && value <= 40) years = Math.max(years, value);
  }
  if (years > 0) profile.yearsExperience = years;
  // 取档案里最高的一档：写过「硕士」就按硕士判。
  const degrees = degreeHits(resumeText, clauses);
  if (degrees.length) {
    profile.education = degrees.reduce((hi, h) => (DEGREE_RANK[h.level] > DEGREE_RANK[hi.level] ? h : hi), degrees[0]).level;
  }
  return profile;
}

/* ---------------------------- 组装 ---------------------------- */

export function applyRetrievalGate(
  jobs: MatchedJob[],
  opts: { profile: ProfileHardFields; nowMs?: number },
): RetrievalGateResult {
  const now = opts.nowMs ?? Date.now();
  const seen = new Set<string>();
  const kept: GatedJob[] = [];
  const filtered: FilteredJob[] = [];
  const pending = new Set<HardDimension>();

  for (const job of jobs) {
    const dedupeKey = jobDedupeKey({ company: job.company, title: job.title, location: job.location });
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const { hard, requirements } = jdHardRequirements(`${job.title}\n${job.location}\n${job.description}`);
    const { verdict, trace } = hardFilter(hard, opts.profile);
    if (verdict === "drop") {
      filtered.push({
        id: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        url: job.url,
        publishedAt: job.publishedAt,
        reasons: trace.filter((t) => t.outcome === "fail").map((t) => t.detail),
      });
      continue;
    }
    const pendingProfileFields = trace
      .filter((t) => t.outcome === "profile_missing")
      .map((t) => t.dimension as HardDimension);
    pendingProfileFields.forEach((field) => pending.add(field));
    kept.push({ ...job, dedupeKey, freshness: freshnessLabel(job.publishedAt, now), hardVerdict: verdict, pendingProfileFields, jdRequirements: requirements });
  }
  return { kept, filtered, pendingProfileFields: [...pending] };
}

/* -------------------- 与库里已跟踪岗位比对 FR-10 后半 -------------------- */

/**
 * 「同一条岗位」只认来源链接一模一样。
 *
 * 为什么不用公司 + 岗位名：那会把「字节 · 产品经理（上海）」和「字节 · 产品经理（北京）」
 * 当成一条藏起来——用户少看到的正是一个真机会。认错比漏认贵，所以取最严的口径：
 * 链接相同 = 就是招聘板上同一条布告。漏掉的是跨源重发的老岗，最多重复推荐一条。
 *
 * 链接从哪来：本页「加进投递跟踪」写进 JD 的「来源：」行（见 JobDiscovery 的导入模板）。
 * 用户手粘的 JD 没有这一行 → 拿不准 → 照常推荐。
 */
const SAVED_SOURCE_LINE = /^\s*来源\s*[：:]\s*(https?:\/\/\S+?)\s*$/m;

function canonicalUrl(url: string): string {
  // 先去锚点再去尾斜杠：`/9/#x` 的斜杠在锚点前面，反了顺序它会留下来，和 `/9` 对不上。
  return url.trim().replace(/#.*$/, "").replace(/\/+$/, "");
}

/** 库里已跟踪岗位对应的来源链接集合。 */
export function trackedJobUrls(opportunities: Array<{ workspaceType?: string; jdText?: string | null }>): Set<string> {
  const urls = new Set<string>();
  for (const item of opportunities) {
    if (item.workspaceType !== "job") continue;
    const hit = item.jdText ? SAVED_SOURCE_LINE.exec(item.jdText) : null;
    if (hit) urls.add(canonicalUrl(hit[1]));
  }
  return urls;
}

export interface SavedJobSplit {
  /** 用户还没跟踪的：进候选池。 */
  fresh: DiscoveredJob[];
  /** 已经在跟踪的：按链接去重后逐条回给用户，不静默吞掉。 */
  tracked: Array<{ company: string; title: string }>;
}

/**
 * 比对发生在 `matchJobs` 之前：否则已跟踪的那几条会白白占掉界面上的候选位，
 * 用户少看的正是他本来要的新岗位。集合为空（没库、没链接）时全部按新处理——
 * 宁可重复推荐一条，也不能因为比对坏了就少给岗位。
 */
export function splitSavedJobs(jobs: DiscoveredJob[], urls: Set<string>): SavedJobSplit {
  const fresh: DiscoveredJob[] = [];
  const seen = new Set<string>();
  const tracked: SavedJobSplit["tracked"] = [];
  for (const job of jobs) {
    const url = canonicalUrl(job.url);
    if (urls.has(url)) {
      if (seen.has(url)) continue;
      seen.add(url);
      tracked.push({ company: job.company, title: job.title });
      continue;
    }
    fresh.push(job);
  }
  return { fresh, tracked };
}
