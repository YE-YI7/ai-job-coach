import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { RawJobPosting } from "@/lib/coach-harness/subagents/retrieval";
import type { LiveSearchResult, LiveSourceDescriptor } from "./live-sources";

export const OPEN_SEARCH_SOURCE: LiveSourceDescriptor = { id: "web-search", label: "跨公司公开招聘搜索", homepage: "https://exa.ai", mode: "keyword", coverageNote: "自动发现企业、招聘平台和高校公开岗位，含非互联网行业；索引可能滞后，不保证全国覆盖" };
export const OPEN_SEARCH_VERSION = "open-cn-jobs-v2-attributed";
const CITIES = ["北京","上海","天津","重庆","广州","深圳","杭州","南京","苏州","成都","武汉","西安","长沙","合肥","济南","青岛","郑州","厦门","福州","珠海","东莞","佛山","宁波","无锡","大连","沈阳","哈尔滨","长春","石家庄","太原","南昌","南宁","昆明","贵阳","海口","兰州","乌鲁木齐","呼和浩特","银川","西宁","拉萨","香港","澳门"];

/** Only controlled cities and already privacy-gated direction/skill terms leave the app. */
export function openSearchQueries(keywords: string[], location: string): string[] {
  const cities = CITIES.filter(city => location.includes(city)).slice(0, 3).join(" ");
  const role = keywords[0];
  if (!role) return [];
  const focus = keywords.slice(1).filter(k => !/^(工程师|开发|设计|运营|产品经理)$/.test(k)).slice(0, 2).join(" ");
  return [...new Set([
    `${cities || "中国"} ${role} 招聘 职位详情 岗位职责 任职要求`,
    `${cities || "中国"} ${role} ${focus} 企业招聘 官网 社会招聘`,
  ])];
}

/** Discovered URLs are data, never local fetch targets. Block credentials/private addresses even for the external reader. */
export function publicJobUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) || url.hostname.startsWith("[")
      || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
      || /(?:token|secret|password|auth|session|key)=/i.test(url.search)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

async function boundedText(response: Response): Promise<string> {
  if (!response.ok || !response.body) throw Error("跨公司搜索服务不可用");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) throw Error("搜索响应超过预算");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks).toString("utf8");
}

/** Exa's hosted MCP public tier; no dependence on the developer's desktop MCP or cookies. */
export async function callSearchTool(name: "web_search_exa" | "web_fetch_exa", args: Record<string, unknown>): Promise<string> {
  const endpoint = new URL("https://mcp.exa.ai/mcp");
  if (process.env.EXA_API_KEY) endpoint.searchParams.set("exaApiKey", process.env.EXA_API_KEY);
  const response = await fetch(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await boundedText(response);
  const records = raw.startsWith("{") ? [raw] : raw.split(/\r?\n/).filter(line => line.startsWith("data: ")).map(line => line.slice(6));
  for (const record of records) {
    const packet = JSON.parse(record) as { error?: unknown; result?: { isError?: boolean; content?: {type:string;text?:string}[] } };
    if (packet.error || packet.result?.isError) throw Error("跨公司搜索未完成或额度受限");
    if (packet.result?.content) return packet.result.content.filter(c => c.type === "text").map(c => c.text ?? "").join("\n");
  }
  throw Error("跨公司搜索返回格式异常");
}

export interface SearchHit { title: string; url: string; text: string }
export function parseSearchHits(text: string): SearchHit[] {
  return text.split(/\n---\s*\n/).flatMap(block => {
    const title = block.match(/(?:^|\n)Title: ([^\n]+)/)?.[1]?.trim();
    const url = publicJobUrl(block.match(/(?:^|\n)URL: (\S+)/)?.[1] ?? "");
    return title && url ? [{ title, url, text: block.slice(0, 12000) }] : [];
  });
}

/** Only concrete, attributed postings. Unknown identity is discarded, not guessed from the search query. */
export function parseOpenPosting(hit: SearchHit, page: string, fetchedAt: string): RawJobPosting | null {
  if (!page.includes(hit.url) || /职位已关闭|职位已下线|停止招聘|招聘已结束|job (?:is )?(?:closed|expired)|页面不存在/i.test(page)) return null;
  const text = page.split(/(?:相似职位|推荐职位|猜你喜欢|办公时间|联系地址|## 公司简介|### 猎聘温馨提示)/)[0]
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  if (!/(岗位职责|工作职责|工作内容|职责描述|职位描述|职位介绍)/.test(text) || !/(任职要求|任职资格|岗位要求|职位要求|招聘要求|专业要求)/.test(text)) return null;
  if (/招聘列表|职位列表|招聘信息汇总|招聘公告|招聘简章|面经|面试经验|求职攻略/.test(hit.title)) return null;
  const liepin = hit.title.match(/^【(.+?)\s+(.+?)招聘】-(.+?)(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|天津|重庆|长沙|西安|合肥|济南|青岛|郑州|厦门|福州|珠海|东莞|佛山|宁波|无锡|大连|沈阳)?招聘信息-猎聘/);
  const separated = hit.title.match(/^(.+?)[_—–-]([^_—–-]+?(?:有限公司|公司|集团|医院|银行|研究院|学校))(?:招聘)?(?:\s+-.*)?$/);
  const companyLabel = text.match(/(?:公司名称|企业名称|招聘单位)[：:]\s*([^\n|]{2,70})/)?.[1]?.trim();
  const company = liepin?.[3] || separated?.[2] || companyLabel;
  const title = liepin?.[2] || separated?.[1] || hit.title.replace(/\s*[-_].*$/, "");
  if (!company || /猎头顾问|公司招聘|招聘平台/.test(company) || !text.includes(company) || !text.includes(title.replace(/\([^)]*\)/g, "").trim())) return null;
  const explicitLocation = text.match(/(?:工作地域|工作地点|工作城市|职位地点)[：:]\s*([^\n|]{2,70})/)?.[1];
  const location = explicitLocation ? CITIES.filter(city => explicitLocation.includes(city)).join("、") : liepin?.[1] || CITIES.find(city => new RegExp(`(?:^|\\n)\\s*${city}[^\\n]{0,50}(?:丨|年|本科|大专|全职|薪)`).test(text));
  if (!location || !CITIES.some(city => location.includes(city))) return null;
  const date = text.match(/(?:发布时间|发布日期)[：:]\s*(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/)?.[1];
  const postedAt = date && Number.isFinite(Date.parse(date)) ? new Date(Date.parse(date)).toISOString() : null;
  const jdStart = text.search(/岗位职责|工作职责|工作内容|职责描述|职位描述|职位介绍/);
  const jd = text.slice(jdStart);
  return { sourceId: `web:${createHash("sha256").update(hit.url).digest("hex").slice(0,20)}`, url: hit.url, company, title: title.slice(0,200), location,
    fetchedAt, postedAt, rawPageText: `公开招聘页读取（搜索索引可能滞后，在招状态请核实）\n${jd.slice(0,12000)}` };
}

/** Two searches + one batch read, no model call, max eight concrete pages, failures retained. */
export async function searchOpenJobs(keywords: string[], location: string): Promise<LiveSearchResult> {
  const queries = openSearchQueries(keywords, location);
  const failures: LiveSearchResult["failures"] = []; let calls = 0;
  const hits: SearchHit[] = [];
  await Promise.all(queries.map(async query => {
    calls++;
    try { hits.push(...parseSearchHits(await callSearchTool("web_search_exa", { query, numResults: 10,
      objective: "寻找中国境内具体职位详情，覆盖企业官网、合法公开招聘平台、高校就业网，不限互联网公司；需要明确雇主公司名称、地点、岗位职责和任职要求。排除匿名猎头顾问岗位、资讯、求职攻略、职位列表、已关闭岗位；优先近期来源。" }))); }
    catch { failures.push({ source: "web-search", keyword: query }); }
  }));
  const unique = [...new Map(hits.map(hit => [hit.url, hit])).values()]
    .filter(hit=>!/(猎头顾问|招聘列表|职位列表|面经|招聘简章|求职攻略)/.test(hit.title))
    .sort((a,b)=>Number(/招聘】-.+招聘信息|有限公司|公司|集团|医院|银行/.test(b.title))-Number(/招聘】-.+招聘信息|有限公司|公司|集团|医院|银行/.test(a.title)))
    .slice(0,8);
  if (!unique.length) return { postings: [], calls, failures, truncatedCalls: 0 };
  calls++;
  try {
    const pages = await callSearchTool("web_fetch_exa", { urls: unique.map(h => h.url), maxCharacters: 10000 });
    // Each page must have its own URL block; never attribute one page's JD to another hit.
    const blocks = pages.split(/(?=^# [^\n]+\nURL: )/m);
    const postings = unique.flatMap(hit => {
      const page = blocks.find(block => block.match(/(?:^|\n)URL: (\S+)/)?.[1] === hit.url);
      const posting = page ? parseOpenPosting(hit, page, new Date().toISOString()) : null;
      if (!page) failures.push({source:"web-search",keyword:`详情读取：${hit.url}`});
      return posting ? [posting] : [];
    });
    return { postings, calls, failures, truncatedCalls: 0 };
  } catch { failures.push({ source: "web-search", keyword: "岗位详情读取" }); return { postings: [], calls, failures, truncatedCalls: 0 }; }
}
