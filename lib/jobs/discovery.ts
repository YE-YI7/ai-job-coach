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

const roles = [
  ["产品经理", "product manager", "product management"],
  ["工程师", "engineer", "developer", "开发"],
  ["设计", "designer", "design"],
  ["运营", "operations", "运营经理"],
  ["销售", "sales", "account executive"],
];
const cities = [["上海", "shanghai"], ["北京", "beijing"], ["深圳", "shenzhen"], ["杭州", "hangzhou"], ["广州", "guangzhou"], ["香港", "hong kong"]];
export function matchJobs(jobs: DiscoveredJob[], profile: { role: string; location: string; resume: string }) {
  const role = profile.role.toLowerCase();
  const roleTerms = roles.filter(group => group.some(term => role.includes(term))).flat();
  if (!roleTerms.length) roleTerms.push(...role.split(/[\s/、,，]+/).filter(term => term.length >= 2));
  const location = profile.location.toLowerCase().trim();
  const unrestricted = !location || /^(不限|地点待确认|待确认|全国)$/.test(location);
  const locationTerms = cities.filter(group => group.some(term => location.includes(term))).flat();
  if (!locationTerms.length && !unrestricted) locationTerms.push(...location.split(/[/、,，]+/).map(s=>s.trim()).filter(Boolean));
  // Remote is not assumed to mean permission to work from any country.
  const skills = ["python", "sql", "typescript", "react", "llm", "agent", "rag", "机器学习", "用户研究"]
    .filter(skill => profile.resume.toLowerCase().includes(skill));
  return jobs.flatMap(job => {
    if (!roleTerms.some(term => job.title.toLowerCase().includes(term))) return [];
    if (!unrestricted && !locationTerms.some(term => job.location.toLowerCase().includes(term))) return [];
    const overlaps = skills.filter(skill => job.description.toLowerCase().includes(skill));
    return [{ ...job, reasons: ["职位名称与求职方向相关", ...(unrestricted ? [] : ["招聘地点与所选城市一致"]),
      ...(overlaps.length ? [`简历与 JD 同时提到：${overlaps.join("、")}`] : [])], overlaps: overlaps.length }];
  }).sort((a,b) => b.overlaps-a.overlaps || a.id.localeCompare(b.id)).slice(0, 5)
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
