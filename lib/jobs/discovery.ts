/** Public job metadata is shared; resumes are only used locally for keyword ranking. */
export const JOB_SOURCES = [
  { board: "meshy", company: "Meshy" },
  { board: "kong", company: "Kong" },
] as const;
export type JobSource = { board: string; company: string };
export type DiscoveredJob = {
  id: string; company: string; title: string; location: string;
  url: string; description: string; checkedAt: string; publishedAt: string | null;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function parseJobBoard(payload: unknown, source: JobSource, checkedAt: string): DiscoveredJob[] {
  const rows = (payload as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(rows)) throw new Error("招聘源返回格式异常");
  const seen = new Set<string>();
  return rows.slice(0, 2000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (row.isListed !== true) return [];
    let url: URL;
    try { url = new URL(text(row.jobUrl)); } catch { return []; }
    if (url.protocol !== "https:" || url.hostname !== "jobs.ashbyhq.com" || url.username || url.password
      || !url.pathname.startsWith(`/${source.board}/`)) return [];
    url.search = ""; url.hash = "";
    if (seen.has(url.href) || !text(row.title) || !text(row.descriptionPlain)) return [];
    seen.add(url.href);
    const secondary = Array.isArray(row.secondaryLocations) ? row.secondaryLocations.map(item => text((item as {location?:unknown})?.location)) : [];
    return [{ id: url.pathname, company: source.company, title: text(row.title).slice(0, 200),
      location: [text(row.location), ...secondary].filter(Boolean).join(" / ").slice(0, 500),
      url: url.href, description: text(row.descriptionPlain).slice(0, 24000), checkedAt,
      publishedAt: Number.isFinite(Date.parse(text(row.publishedAt))) ? text(row.publishedAt) : null }];
  });
}

/** 岗位方向的中英对照词表：出网关键词与本地命中判定共用同一份，不造第二套口径。 */
export const ROLE_SYNONYMS: string[][] = [
  ["产品经理", "product manager", "product management"],
  ["工程师", "engineer", "developer", "开发"],
  ["设计", "designer", "design"],
  ["运营", "operations", "运营经理"],
  ["销售", "sales", "account executive"],
  ["数据分析", "data analyst", "analytics"],
  ["项目管理", "project manager", "program manager"],
];
/** 简历里认得出的技能词：出网时只用这些固定英文词，简历自由文本一律不出网。 */
export const SKILL_TERMS: string[] = [
  "python", "sql", "typescript", "react", "llm", "agent", "rag",
  "机器学习", "用户研究", "需求分析", "数据分析", "a/b test",
];
const cities = [["上海", "shanghai"], ["北京", "beijing"], ["深圳", "shenzhen"], ["杭州", "hangzhou"], ["广州", "guangzhou"], ["香港", "hong kong"]];
/** 上网搜一轮能捞回两三百条，界面上给到 12 条候选；再多就变成列表噪音，看不见理由了。 */
export function matchJobs(jobs: DiscoveredJob[], profile: { role: string; location: string; resume: string }, limit = 12) {
  const role = profile.role.toLowerCase();
  const roleTerms = ROLE_SYNONYMS.filter(group => group.some(term => role.includes(term))).flat();
  if (!roleTerms.length) roleTerms.push(...role.split(/[\s/、,，]+/).filter(term => term.length >= 2));
  const location = profile.location.toLowerCase().trim();
  const unrestricted = !location || /^(不限|地点待确认|待确认|全国)$/.test(location);
  const locationTerms = cities.filter(group => group.some(term => location.includes(term))).flat();
  if (!locationTerms.length && !unrestricted) locationTerms.push(...location.split(/[/、,，]+/).map(s=>s.trim()).filter(Boolean));
  const skills = SKILL_TERMS.filter(skill => profile.resume.toLowerCase().includes(skill));
  return jobs.flatMap(job => {
    if (!roleTerms.some(term => job.title.toLowerCase().includes(term))) return [];
    // Remote is not assumed to mean permission to work from any country.
    const remoteOnly = /^(remote|worldwide|anywhere|全球|远程|不限地点)$/i.test(job.location.trim());
    if (!unrestricted && !remoteOnly && !locationTerms.some(term => job.location.toLowerCase().includes(term))) return [];
    const overlaps = skills.filter(skill => job.description.toLowerCase().includes(skill));
    return [{ ...job, reasons: ["职位名称与求职方向相关",
      ...(unrestricted ? [] : remoteOnly ? ["岗位标注远程，能否在你所在城市工作需向招聘方核实"] : ["招聘地点与所选城市一致"]),
      ...(overlaps.length ? [`简历与 JD 同时提到：${overlaps.join("、")}`] : [])], overlaps: overlaps.length }];
  }).sort((a,b) => b.overlaps-a.overlaps || a.id.localeCompare(b.id)).slice(0, limit)
    .map(({id, company, title, location, url, description, checkedAt, publishedAt, reasons}) => ({id, company, title, location, url, description, checkedAt, publishedAt, reasons}));
}

export async function fetchJobBoard(source: JobSource): Promise<DiscoveredJob[]> {
  if (!JOB_SOURCES.some(item => item.board === source.board && item.company === source.company)) throw Error("不支持的招聘源");
  const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${source.board}`, {
    redirect: "error", signal: AbortSignal.timeout(12000), cache: "no-store",
  });
  if (!response.ok || !response.body) throw Error("招聘源暂时不可用");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); throw Error("招聘源内容过大"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return parseJobBoard(JSON.parse(Buffer.concat(chunks).toString("utf8")), source, new Date().toISOString());
}
