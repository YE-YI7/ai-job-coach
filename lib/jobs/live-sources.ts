/**
 * 益职**运行时**自己上网搜岗位的数据源层（不是开发时把结果抄进仓库）。
 *
 * 现状与边界（2026-09-30 逐源实测，不是照文档抄的）：
 * - 免 key、能按关键词查的只有英文/远程板子：RemoteOK（`?tag=`，实测按词返回不同结果）、
 *   Jobicy（`?tag=`，认空格不认连字符）。Remotive 的公开接口**任何参数都不生效**
 *   （`?search=nurse` 与不带参数返回同一批 16 条），所以按「最新一批」的流源用，不假装搜过。
 * - 10-01接腾讯官网公开查询；产品默认只查国内源。BOSS/猎聘/拉勾不绕登录墙/验证码。
 * - 每个源都可能坏。一个源坏了不能把整批结果变成「没有岗位」，也不能悄悄少几个源不说
 *   （`failures` 一路带到界面）。
 * - 出网的只有关键词（过 PII 闸），回来的正文一律按不可信数据处理。
 */
import type { RawJobPosting } from "@/lib/coach-harness/subagents/retrieval";
import { fetchJobBoard, JOB_SOURCES, type DiscoveredJob } from "./discovery";

export type LiveSourceId = "remoteok" | "jobicy" | "remotive" | "ashby" | "tencent" | "netease";
/** keyword = 每个关键词打一次；feed = 源不支持按词查，整轮只拉一次。 */
export type LiveSourceMode = "keyword" | "feed";
export interface LiveSourceDescriptor {
  id: LiveSourceId;
  label: string;
  /** 源自己的文档/首页：界面要能告诉用户「这批是从哪搜来的」。 */
  homepage: string;
  mode: LiveSourceMode;
  /** 中文岗位覆盖情况：不粉饰英文远程板子当全市场。 */
  coverageNote: string;
}

export const LIVE_SOURCES: LiveSourceDescriptor[] = [
  { id: "tencent", label: "腾讯招聘官网", homepage: "https://careers.tencent.com", mode: "keyword", coverageNote: "国内社会招聘，单公司覆盖；不是全市场" },
  { id: "netease", label: "网易招聘官网", homepage: "https://hr.163.com", mode: "keyword", coverageNote: "国内社会招聘，含职责与任职要求；不是全市场" },
  { id: "remoteok", label: "RemoteOK 远程岗位", homepage: "https://remoteok.com", mode: "keyword", coverageNote: "英文远程岗为主" },
  { id: "jobicy", label: "Jobicy 远程岗位", homepage: "https://jobicy.com", mode: "keyword", coverageNote: "英文远程岗为主" },
  { id: "remotive", label: "Remotive 远程岗位", homepage: "https://remotive.com/remote-jobs", mode: "feed", coverageNote: "接口只给最新一批，不支持按词查" },
  { id: "ashby", label: "公司公开招聘板", homepage: "https://jobs.ashbyhq.com", mode: "feed", coverageNote: "只覆盖已登记的公司" },
];
export const DOMESTIC_SOURCE_IDS: LiveSourceId[] = ["tencent", "netease"];
export const DOMESTIC_SEARCH_VERSION = "cn-official-v3-specialty";

/** 源要求的使用条件：署名与「跳转原页投递」，不是可选项。 */
export const SOURCE_CREDIT = "岗位来自对应招聘官网或公开招聘接口，请到原页核实并投递；不会代你提交。";

const MAX_BYTES = 4_000_000;
const TIMEOUT_MS = 12_000;

class SourceError extends Error {}

/** 出网纪律：只允许 https + 白名单主机 + 不跟随跳转 + 体积上限 + 超时。 */
async function fetchJson(url: URL, allowedHosts: string[], body?: Record<string, unknown>): Promise<unknown> {
  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname)) throw new SourceError("不支持的地址");
  let response: Response;
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), "user-agent": "YiZhiJobCoach/1.0 (job search for the signed-in user)" } });
  } catch { throw new SourceError("招聘源暂时不可用"); }
  if (!response.ok || !response.body) throw new SourceError("招聘源暂时不可用");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new SourceError("招聘源内容过大"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SourceError("招聘源返回格式异常"); }
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** 正文按不可信数据处理：只取文本、去标签、压空白、截长度；界面不渲染它的 HTML。 */
function toPlainText(html: string): string {
  return html
    // 先还原转义：否则 `&lt;script&gt;` 这类被编码的标签会绕过剥离，把 `<` 留在正文里。
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24_000);
}

function httpsUrl(value: unknown, allowedHosts: string[]): string | null {
  const raw = str(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}

const isoNow = () => new Date().toISOString();
const postedIso = (value: unknown): string | null => {
  const raw = str(value);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(Date.parse(raw)).toISOString() : null;
};

interface SearchContext { keyword: string }

interface Adapter {
  id: LiveSourceId;
  hosts: string[];
  search(context: SearchContext): Promise<RawJobPosting[]>;
}

/** 一次调用最多留几条：源动辄回 100 条全文，扇出下去正文只用来做关键词初筛与硬筛。 */
const ROWS_PER_CALL = 40;

const remotiveAdapter: Adapter = {
  id: "remotive",
  hosts: ["remotive.com"],
  // 实测：`search`/`limit`/`category` 都不生效，永远返回同一批最新岗位。按流源取一次，
  // 关键词匹配交给本地初筛——不能对用户宣称「按词搜过 Remotive」。
  async search() {
    const payload = await fetchJson(new URL("https://remotive.com/api/remote-jobs"), this.hosts) as { jobs?: unknown[] };
    if (!Array.isArray(payload.jobs)) throw new SourceError("招聘源返回格式异常");
    const fetchedAt = isoNow();
    return payload.jobs.slice(0, ROWS_PER_CALL).flatMap((raw) => {
      const row = raw as Record<string, unknown>;
      const url2 = httpsUrl(row.url, ["remotive.com"]);
      const title = str(row.title);
      const company = str(row.company_name);
      if (!url2 || !title || !company) return [];
      return [{
        sourceId: `remotive:${str(row.id) || url2}`,
        url: url2, company, title: title.slice(0, 200),
        location: str(row.candidate_required_location) || "远程",
        remote: true, postedAt: postedIso(row.publication_date), fetchedAt,
        rawPageText: toPlainText(str(row.description)),
      }];
    });
  },
};

const jobicyAdapter: Adapter = {
  id: "jobicy",
  hosts: ["jobicy.com"],
  async search({ keyword }) {
    const url = new URL("https://jobicy.com/api/v2/remote-jobs");
    url.searchParams.set("count", String(ROWS_PER_CALL));
    // 实测：`tag` 认空格（`product manager` 有结果），连字符（`product-manager`）返回 0 条。
    url.searchParams.set("tag", keyword.toLowerCase());
    const payload = await fetchJson(url, this.hosts) as { jobs?: unknown[] };
    if (!Array.isArray(payload.jobs)) throw new SourceError("招聘源返回格式异常");
    const fetchedAt = isoNow();
    return payload.jobs.slice(0, ROWS_PER_CALL).flatMap((raw) => {
      const row = raw as Record<string, unknown>;
      const url2 = httpsUrl(row.url, ["jobicy.com"]);
      const title = str(row.jobTitle);
      const company = str(row.companyName);
      if (!url2 || !title || !company) return [];
      return [{
        sourceId: `jobicy:${str(row.id) || url2}`,
        url: url2, company, title: title.slice(0, 200),
        location: str(row.geo) || "远程", remote: true,
        postedAt: postedIso(row.pubDate), fetchedAt,
        rawPageText: toPlainText(str(row.jobDescription)),
      }];
    });
  },
};

const remoteokAdapter: Adapter = {
  id: "remoteok",
  hosts: ["remoteok.com"],
  async search({ keyword }) {
    const url = new URL("https://remoteok.com/api");
    url.searchParams.set("tag", keyword.toLowerCase());
    const payload = await fetchJson(url, this.hosts);
    // 这个源回的是数组，第 0 格是服务器说明而不是岗位；逐格校验字段，说明行自然被丢掉。
    if (!Array.isArray(payload)) throw new SourceError("招聘源返回格式异常");
    const fetchedAt = isoNow();
    return payload.slice(0, ROWS_PER_CALL + 1).flatMap((raw) => {
      const row = raw as Record<string, unknown>;
      const url2 = httpsUrl(row.url, ["remoteok.com"]);
      const title = str(row.position);
      const company = str(row.company);
      if (!url2 || !title || !company) return [];
      return [{
        sourceId: `remoteok:${str(row.id) || url2}`,
        url: url2, company, title: title.slice(0, 200),
        location: str(row.location) || "远程", remote: true,
        postedAt: postedIso(row.date), fetchedAt,
        rawPageText: toPlainText(str(row.description)),
      }];
    });
  },
};

/** Ashby 是「按公司名逐块板子查」，不是关键词搜索：命中判断发生在本地筛之后。 */
const ashbyAdapter: Adapter = {
  id: "ashby",
  hosts: ["api.ashbyhq.com", "jobs.ashbyhq.com"],
  async search() {
    const fetchedAt = isoNow();
    const boards = await Promise.all(JOB_SOURCES.map((source) => fetchJobBoard(source).catch(() => [] as DiscoveredJob[])));
    return boards.flat().map((job) => ({
      sourceId: `ashby:${job.id}`,
      url: job.url, company: job.company, companyDomain: "jobs.ashbyhq.com",
      title: job.title, location: job.location, postedAt: job.publishedAt,
      fetchedAt: job.checkedAt || fetchedAt, rawPageText: job.description,
    }));
  },
};

/** 官网公开查询：只发送过闸关键词，拒绝海外、失效和地区不明的条目。 */
const tencentAdapter: Adapter = {
  id: "tencent", hosts: ["careers.tencent.com"],
  async search({ keyword }) {
    const url = new URL("https://careers.tencent.com/tencentcareer/api/post/Query");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("pageIndex", "1"); url.searchParams.set("pageSize", "40"); url.searchParams.set("language", "zh-cn");
    const payload = await fetchJson(url, this.hosts) as { Code?: number; Data?: { Posts?: unknown[] } };
    if (payload.Code !== 200 || !Array.isArray(payload.Data?.Posts)) throw new SourceError("招聘源返回格式异常");
    const fetchedAt = isoNow();
    return payload.Data.Posts.slice(0, ROWS_PER_CALL).flatMap(raw => {
      const row = raw as Record<string, unknown>, id = str(row.PostId), title = str(row.RecruitPostName), location = str(row.LocationName);
      if (!/^\d+$/.test(id) || !title || !location || row.IsValid !== true || str(row.CountryName) !== "中国") return [];
      // LastUpdateTime 是更新时间，不伪装成首次发布时间。
      return [{ sourceId: `tencent:${id}`, url: `https://careers.tencent.com/jobdesc.html?postId=${id}`,
        company: "腾讯", companyDomain: "tencent.com", title: title.slice(0, 200), location,
        fetchedAt, postedAt: null, rawPageText: toPlainText(["招聘官网列表摘要（未包含完整任职要求）", str(row.Responsibility), str(row.RequireWorkYearsName).replace(/([一二三四五六七八九十])年/g,(_,n:string)=>`${"一二三四五六七八九十".indexOf(n)+1}年`)].filter(Boolean).join("\n")) }];
    });
  },
};

// 官网自身使用的公开查询，不需登录；只发送过闸关键词，不发送用户简历。
const neteaseAdapter: Adapter = {
  id: "netease", hosts: ["hr.163.com"],
  async search({ keyword }) {
    const payload = await fetchJson(new URL("https://hr.163.com/api/hr163/position/queryPage"), this.hosts,
      { currentPage: 1, pageSize: ROWS_PER_CALL, keyword }) as { code?: number; data?: { list?: unknown[] } };
    if (payload.code !== 200 || !Array.isArray(payload.data?.list)) throw new SourceError("招聘源返回格式异常");
    const fetchedAt = isoNow();
    return payload.data.list.slice(0, ROWS_PER_CALL).flatMap(raw => {
      const row = raw as Record<string, unknown>, id = String(row.id ?? ""), title = str(row.name);
      const places = Array.isArray(row.workPlaceNameList) ? row.workPlaceNameList.map(str) : [];
      // 不把海外／地点不明岗位映射为国内或远程。多个地点逐一保留国内地点。
      const domestic = places.filter(place => /^(?:北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|长沙|合肥|济南|青岛|郑州|厦门|福州|珠海|东莞|佛山|宁波|无锡|大连|沈阳|哈尔滨|长春|石家庄|太原|南昌|南宁|昆明|贵阳|海口|兰州|乌鲁木齐|呼和浩特|银川|西宁|拉萨|香港|澳门)/.test(place));
      if (!/^\d+$/.test(id) || !title || !domestic.length) return [];
      return [{ sourceId: `netease:${id}`, url: `https://hr.163.com/job-detail.html?id=${id}&lang=zh`, company: "网易", companyDomain: "netease.com",
        title: title.slice(0, 200), location: domestic.join("、"), fetchedAt, postedAt: null,
        rawPageText: toPlainText(["岗位职责", str(row.description), "任职要求", str(row.requirement), str(row.reqEducationName), str(row.reqWorkYearsName)].join("\n")) }];
    });
  },
};

const ADAPTERS: Record<LiveSourceId, Adapter> = { tencent: tencentAdapter, netease: neteaseAdapter, remoteok: remoteokAdapter, jobicy: jobicyAdapter, remotive: remotiveAdapter, ashby: ashbyAdapter };

export interface LiveSearchResult {
  postings: RawJobPosting[];
  /** 逐源逐关键词的调用与失败：界面要能说「哪个源这次没读到」。 */
  failures: Array<{ source: LiveSourceId; keyword: string }>;
  calls: number;
  /** 被扇出上限截掉的调用次数：宁可少搜几个词，也不能压垮源或顶爆请求超时。 */
  truncatedCalls: number;
}

/** 并发上限：对外的礼貌值。串行会顶爆请求超时，全并发像打点。 */
const CONCURRENCY = 3;

interface Task { source: LiveSourceId; keyword: string }

/**
 * 扇出纪律：`keyword` 型源每个关键词打一次；`feed` 型源不支持按词查，整轮只取一次
 * （否则 N 个关键词把同一批岗位拉 N 遍）。
 * 排队顺序是「先把每个源各摸一次，再按关键词铺开」：预算被 `maxCalls` 截断时，
 * 截掉的是靠后的关键词，而不是某个源一整轮没被碰到。被截掉的记进 `failures`，不静默少源。
 */
export async function searchLiveJobs(keywords: string[], options: { sourceIds?: LiveSourceId[]; maxCalls?: number } = {}): Promise<LiveSearchResult> {
  const ids = options.sourceIds ?? LIVE_SOURCES.map((source) => source.id);
  const active = LIVE_SOURCES.filter((source) => ids.includes(source.id));
  const tasks: Task[] = [];
  for (const source of active) if (source.mode === "feed") tasks.push({ source: source.id, keyword: "" });
  for (const keyword of keywords) for (const source of active) if (source.mode === "keyword") tasks.push({ source: source.id, keyword });
  const capped = tasks.slice(0, options.maxCalls ?? tasks.length);
  const truncated = tasks.length - capped.length;

  const failures: LiveSearchResult["failures"] = [];
  for (const dropped of tasks.slice(capped.length)) failures.push({ source: dropped.source, keyword: dropped.keyword });

  const postings: RawJobPosting[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < capped.length) {
      const task = capped[cursor++];
      try { postings.push(...await ADAPTERS[task.source].search({ keyword: task.keyword })); }
      catch { failures.push({ source: task.source, keyword: task.keyword }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, capped.length) }, worker));

  const seen = new Set<string>();
  const unique = postings.filter((posting) => (seen.has(posting.sourceId) ? false : (seen.add(posting.sourceId), true)));
  return { postings: unique, failures, calls: capped.length, truncatedCalls: truncated };
}

/**
 * 现链路（关键词初筛 → 硬筛 → 核验）吃的是 `DiscoveredJob` 形状。
 * 这里只做一次视图转换：正文用剥过标签的纯文本，`id` 用源内 id，坏数据在前面适配器里已经挡掉。
 */
export function toDiscoveredJobs(postings: RawJobPosting[]): DiscoveredJob[] {
  return postings.map((posting) => ({
    id: posting.sourceId,
    company: posting.company,
    title: posting.title,
    location: posting.location,
    url: posting.url,
    description: posting.rawPageText ?? "",
    checkedAt: posting.fetchedAt,
    publishedAt: posting.postedAt ?? null,
  }));
}
