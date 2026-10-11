import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { wrapExternalMaterial } from "@/lib/coach-harness/prompt";
import { extractPdfText } from "@/lib/pdf-text";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import { mergeOpportunityMaterial } from "@/lib/opportunities/material-intake";
import {intakeErrorMessage,isHostedIntakeQuotaFailure} from "@/lib/opportunities/intake-error";
import {deferredIntake,preserveUnclassifiedIntake} from "@/lib/opportunities/deferred-intake";
import type { EvidenceStrength, OpportunityRecommendation } from "@/lib/opportunities/types";
import type { IntakePhase } from "@/lib/opportunities/intake-flow";

export const runtime = "nodejs";
export const maxDuration = 120;

const strengths = new Set<EvidenceStrength>(["strong", "weak", "missing", "unverified"]);
const recommendations = new Set<OpportunityRecommendation>(["apply", "prepare_then_apply", "skip"]);
const MAX_SOURCE_LENGTH = 30_000;
const MAX_REMOTE_BYTES = 1_500_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function parseJson(text: string) {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未返回可解析的 JSON");
  return JSON.parse(match[0]);
}

function isBlockedIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return isBlockedIp(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

async function assertPublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只支持公开的 http/https 岗位链接");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("岗位链接使用了不支持的端口");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("不能读取本地地址");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) throw new Error("不能读取内网地址");
  return url;
}

async function readLimitedBody(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_BYTES) {
      await reader.cancel();
      throw new Error("这个页面内容太大，请直接粘贴 JD");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function readableTextFromHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlAttribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtmlText(match[2]).trim() : "";
}

function jobPostingMicrodataText(html: string) {
  const openings = html.matchAll(/<([a-z][\w:-]*)\b[^>]*\bitemtype\s*=\s*(["'])[^"']*schema\.org\/JobPosting[^"']*\2[^>]*>/gi);
  for (const opening of openings) {
    const tagName = opening[1];
    const afterOpening = (opening.index || 0) + opening[0].length;
    const sameTag = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    sameTag.lastIndex = afterOpening;
    let depth = 1;
    let end = html.length;
    for (const tag of html.matchAll(sameTag)) {
      if (/^<\//.test(tag[0])) depth -= 1;
      else if (!/\/>$/.test(tag[0])) depth += 1;
      if (depth === 0) { end = (tag.index || 0) + tag[0].length; break; }
    }
    const block = html.slice(opening.index || 0, end);
    const fields = new Map<string, string[]>();
    for (const match of block.matchAll(/<([a-z][\w:-]*)\b[^>]*\bitemprop\s*=\s*(["'])[^"']+\2[^>]*>/gi)) {
      const tag = match[0];
      const tagName = match[1];
      const property = htmlAttribute(tag, "itemprop");
      const content = htmlAttribute(tag, "content") || htmlAttribute(tag, "datetime");
      let inner = "";
      if (!content && !/\/>$/.test(tag)) {
        const contentStart = (match.index || 0) + tag.length;
        const sameTag = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
        sameTag.lastIndex = contentStart;
        let depth = 1;
        for (const nestedTag of block.matchAll(sameTag)) {
          if (/^<\//.test(nestedTag[0])) depth -= 1;
          else if (!/\/>$/.test(nestedTag[0])) depth += 1;
          if (depth === 0) {
            inner = block.slice(contentStart, nestedTag.index || contentStart);
            break;
          }
        }
      }
      const value = content || readableTextFromHtml(inner);
      if (value) fields.set(property, [...(fields.get(property) || []), value]);
    }
    const get = (...names: string[]) => names.flatMap((name) => fields.get(name) || []).join("；");
    const text = [
      get("title") && `职位：${get("title")}`,
      get("hiringOrganization") && `公司：${get("hiringOrganization")}`,
      get("jobLocation", "address") && `地点：${get("jobLocation", "address")}`,
      get("employmentType") && `用工类型：${get("employmentType")}`,
      get("description") && `岗位职责与要求：\n${get("description")}`,
      get("qualifications") && `任职要求：\n${get("qualifications")}`,
      get("responsibilities") && `岗位职责：\n${get("responsibilities")}`,
    ].filter(Boolean).join("\n");
    if (text.length >= 80) return text;
  }
  return "";
}

function genericPageText(html: string) {
  // Job pages often expose readable content inside semantic landmarks even when
  // they do not publish JSON-LD. Prefer these over the whole page's navigation.
  const semantic = [...html.matchAll(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/gi)]
    .map((match) => readableTextFromHtml(match[1]))
    .filter((text) => text.length >= 80)
    .sort((a, b) => b.length - a.length)[0];
  if (semantic) return semantic;

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const metaValue = (names: string[]) => {
    for (const meta of metas) {
      const key = htmlAttribute(meta, "name") || htmlAttribute(meta, "property");
      if (names.includes(key.toLowerCase())) {
        const content = htmlAttribute(meta, "content");
        if (content) return content;
      }
    }
    return "";
  };
  const title = titleMatch ? readableTextFromHtml(titleMatch[1]) : "";
  const description = metaValue(["description", "og:description", "twitter:description"]);
  const site = metaValue(["og:site_name", "application-name"]);
  const metadata = [site && `公司或网站：${site}`, title && `职位或页面标题：${title}`, description && `页面简介：${description}`]
    .filter(Boolean).join("\n");
  if (metadata.length >= 80) return metadata;

  const withoutChrome = html
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  return readableTextFromHtml(withoutChrome);
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function jobPostingStructuredText(html: string) {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed: unknown = JSON.parse(decodeHtmlText(match[1]));
      const pending = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (pending.length) {
        const candidate = pending.shift();
        if (Array.isArray(candidate)) { pending.push(...candidate); continue; }
        const item = asRecord(candidate);
        if (Array.isArray(item["@graph"])) pending.push(...item["@graph"] as unknown[]);
        const type = item["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (!types.some((entry) => String(entry).toLowerCase() === "jobposting")) continue;

        const organization = asRecord(item.hiringOrganization);
        const locations = Array.isArray(item.jobLocation) ? item.jobLocation : [item.jobLocation];
        const locationText = locations.map((location) => {
          const address = asRecord(asRecord(location).address);
          return [address.addressLocality, address.addressRegion, address.addressCountry]
            .map((part) => typeof part === "string" ? part : "")
            .filter(Boolean).join("、");
        }).filter(Boolean).join("；");
        const fields: Array<[string, unknown]> = [
          ["职位", item.title], ["公司", organization.name], ["地点", locationText],
          ["用工类型", item.employmentType], ["岗位职责", item.description],
          ["任职要求", item.qualifications], ["技能", item.skills],
          ["经验要求", item.experienceRequirements], ["教育要求", item.educationRequirements],
        ];
        const text = fields.flatMap(([label, value]) => {
          const values = Array.isArray(value) ? value : [value];
          const content = values.map((entry) => typeof entry === "string" ? readableTextFromHtml(entry) : "")
            .filter(Boolean).join("；");
          return content ? [`${label}：${content}`] : [];
        }).join("\n");
        if (text.length >= 80) return text;
      }
    } catch {
      // Ignore invalid third-party JSON-LD and continue with visible page text.
    }
  }
  return "";
}

function embeddedJobStateText(html: string) {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    const attributes = match[1];
    if (/application\/ld\+json/i.test(attributes)) continue;
    if (!/application\/(?:ld\+)?json|__NEXT_DATA__|__NUXT_DATA__|INITIAL_STATE|JOB_DATA|JOB_DETAIL/i.test(attributes)) continue;
    try {
      const root: unknown = JSON.parse(match[2]);
      const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
      let inspected = 0;
      while (queue.length && inspected < 8_000) {
        const { value, depth } = queue.shift()!;
        if (!value || typeof value !== "object" || depth > 14) continue;
        inspected += 1;
        if (Array.isArray(value)) {
          for (const entry of value) queue.push({ value: entry, depth: depth + 1 });
          continue;
        }
        const record = asRecord(value);
        const stringField = (keys: string[]) => {
          for (const key of keys) if (typeof record[key] === "string" && String(record[key]).trim()) return String(record[key]).trim();
          return "";
        };
        const title = stringField(["title", "jobTitle", "positionTitle", "postingTitle"]);
        const description = stringField(["descriptionPlain", "descriptionHtml", "description", "jobDescription", "descriptionBody", "content", "body"]);
        if (title && description.length >= 40) {
          const location = stringField(["location", "locationName", "city", "workLocation"]);
          const company = stringField(["companyName", "employerName", "organizationName"]);
          const requirements = stringField(["qualifications", "requirements", "minimumQualifications"]);
          const responsibilities = stringField(["responsibilities", "duties"]);
          return [company && `公司：${company}`, `职位：${title}`, location && `地点：${location}`, `岗位职责与要求：\n${readableTextFromHtml(description)}`, responsibilities && `工作职责：\n${readableTextFromHtml(responsibilities)}`, requirements && `任职要求：\n${readableTextFromHtml(requirements)}`]
            .filter(Boolean).join("\n");
        }
        for (const child of Object.values(record)) queue.push({ value: child, depth: depth + 1 });
      }
    } catch {
      // Ignore non-JSON script payloads; only parse structured data, never execute page scripts.
    }
  }
  return "";
}

function extractStandaloneJobUrl(sourceText: string) {
  const matches = [...sourceText.matchAll(/https?:\/\/[^\s<>"'，。；、)）\]}]+/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const rawUrl = match[0].replace(/[.,，。；;:!?！？》】]+$/g, "");
  const surroundingText = `${sourceText.slice(0, match.index)}${sourceText.slice((match.index || 0) + match[0].length)}`
    .replace(/[\[\]{}()（）<>「」『』“”‘’`*_：: \t\r\n]/g, "")
    .trim();
  // Only fetch an unambiguous pasted link (optionally preceded by a short label).
  // Do not fetch arbitrary URLs buried in a resume or a long note.
  if (surroundingText.length > 40) return null;
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchManusPublicJob(url: URL) {
  const match = url.pathname.match(/^\/(?:cn|en)\/job\/([0-9a-f-]{36})\/?$/i);
  if (url.hostname.toLowerCase() !== "careers.manus.im" || !match) return null;
  const locale = url.pathname.startsWith("/cn/") ? "zh" : "en";
  const input = encodeURIComponent(JSON.stringify({ json: { locale } }));
  const response = await fetch(new URL(`/api/trpc/hr/applications.publicJobs?input=${input}`, url.origin), {
    headers: { "User-Agent": "YiZhiJobCoach/1.0 (+https://ai-job-coach.xin)", Accept: "application/json" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) return null;
  const body = await readLimitedBody(response);
  const payload = asRecord(JSON.parse(body));
  const data = asRecord(asRecord(payload.result).data);
  const jobs = Array.isArray(data.json) ? data.json : [];
  const job = jobs.map(asRecord).find((candidate) => String(candidate.id).toLowerCase() === match[1].toLowerCase());
  if (!job) return null;
  const description = readableTextFromHtml(String(job.descriptionHtml || ""));
  const locations = Array.isArray(job.locations) ? job.locations.filter((value): value is string => typeof value === "string") : [];
  const lines = [
    `职位：${String(job.title || "")}`,
    `公司：Manus`,
    locations.length ? `地点：${locations.join("、")}` : "",
    job.type ? `用工类型：${String(job.type)}` : "",
    job.summary ? `岗位概述：${String(job.summary)}` : "",
    description ? `岗位职责与要求：\n${description}` : "",
    `来源：${url.toString()}`,
  ].filter(Boolean);
  const text = lines.join("\n");
  return text.length >= 80 ? { text: text.slice(0, MAX_SOURCE_LENGTH), finalUrl: url.toString() } : null;
}

async function fetchKnownPublicAtsJob(url: URL) {
  const hostname = url.hostname.toLowerCase();
  let endpoint: URL | null = null;
  let provider = "";
  let requestedId = "";

  // These read-only endpoints are documented/public job-board APIs, not application APIs.
  const greenhouse = ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(hostname)
    ? url.pathname.match(/^\/([a-z0-9_-]+)\/jobs\/(\d+)(?:\/[^/]*)?\/?$/i)
    : null;
  if (greenhouse) {
    provider = "greenhouse";
    requestedId = greenhouse[2];
    endpoint = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(greenhouse[1])}/jobs/${encodeURIComponent(requestedId)}?content=true`);
  }

  const lever = ["jobs.lever.co", "jobs.eu.lever.co"].includes(hostname)
    ? url.pathname.match(/^\/([a-z0-9_-]+)\/([a-f0-9-]{12,})(?:\/[^/]*)?\/?$/i)
    : null;
  if (!endpoint && lever) {
    provider = "lever";
    requestedId = lever[2];
    const apiHost = hostname === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    endpoint = new URL(`https://${apiHost}/v0/postings/${encodeURIComponent(lever[1])}/${encodeURIComponent(requestedId)}?mode=json`);
  }

  const ashby = hostname === "jobs.ashbyhq.com"
    ? url.pathname.match(/^\/([a-z0-9_-]+)\/([a-f0-9-]{12,})(?:\/[^/]*)?\/?$/i)
    : null;
  if (!endpoint && ashby) {
    provider = "ashby";
    requestedId = ashby[2];
    endpoint = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ashby[1])}`);
  }

  if (!endpoint) return null;
  const response = await fetch(endpoint, {
    headers: { "User-Agent": "YiZhiJobCoach/1.0 (+https://ai-job-coach.xin)", Accept: "application/json" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) return null;
  const body = await readLimitedBody(response);
  const payload: unknown = JSON.parse(body);
  let record: UnknownRecord | null = null;
  if (provider === "greenhouse" || provider === "lever") {
    const candidate = asRecord(payload);
    const id = String(candidate.id || "");
    if (id === requestedId) record = candidate;
  } else {
    const jobs = asRecord(payload).jobs;
    if (Array.isArray(jobs)) {
      const job = jobs.map(asRecord).find((candidate) => {
        if (typeof candidate.jobUrl !== "string") return false;
        try { return new URL(candidate.jobUrl).pathname.split("/").filter(Boolean).includes(requestedId); }
        catch { return false; }
      });
      if (job) record = job;
    }
  }
  if (!record) return null;

  const location = asRecord(record.location);
  const categories = asRecord(record.categories);
  const description = provider === "greenhouse"
    ? String(record.content || "")
    : String(record.descriptionPlain || record.descriptionHtml || record.descriptionBodyPlain || record.descriptionBody || record.description || "");
  const title = String(record.title || record.text || record.name || "");
  const locationText = provider === "lever"
    ? String(categories.location || categories.allLocations || "")
    : String(location.name || record.location || record.workplaceType || "");
  const text = [
    `职位：${title}`,
    provider === "greenhouse" && Array.isArray(record.departments) ? `部门：${record.departments.map((item) => String(asRecord(item).name || "")).filter(Boolean).join("、")}` : "",
    locationText && `地点：${locationText}`,
    record.summary && `岗位概述：${String(record.summary)}`,
    description && `岗位职责与要求：\n${readableTextFromHtml(description)}`,
    Array.isArray(record.lists) ? record.lists.map((item) => {
      const list = asRecord(item);
      const content = readableTextFromHtml(String(list.content || ""));
      return content ? `${String(list.text || "岗位要求")}：\n${content}` : "";
    }).filter(Boolean).join("\n") : "",
    `来源：${url.toString()}`,
  ].filter(Boolean).join("\n");
  return text.length >= 80 ? { text: text.slice(0, MAX_SOURCE_LENGTH), finalUrl: url.toString() } : null;
}

async function fetchPublicPage(rawUrl: string) {
  let current = await assertPublicHttpUrl(rawUrl);
  const manusJob = await fetchManusPublicJob(current);
  if (manusJob) return manusJob;
  const atsJob = await fetchKnownPublicAtsJob(current);
  if (atsJob) return atsJob;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "YiZhiJobCoach/1.0 (+https://ai-job-coach.xin)" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new Error("岗位链接重定向过多");
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if ([401, 403, 429].includes(response.status)) {
        throw new Error(`招聘网站拒绝了自动读取请求（${response.status}）。请在官网打开岗位后复制岗位职责和任职要求粘贴；不会绕过登录或验证。`);
      }
      if (!response.ok) throw new Error(`岗位页面暂时无法读取（${response.status}）`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("这个链接不是可读取的网页，请粘贴 JD");
      const text = await readLimitedBody(response);
      const structuredJobText = contentType.includes("text/html")
        ? jobPostingStructuredText(text) || jobPostingMicrodataText(text) || embeddedJobStateText(text)
        : "";
      const readable = structuredJobText || (contentType.includes("text/html") ? genericPageText(text) : text.trim());
      if (readable.length < (structuredJobText ? 40 : 80)) throw new Error("招聘页未提供可直接读取的 JD（可能需要登录或由页面脚本加载）。请从招聘官网复制岗位职责和任职要求后粘贴；不会绕过登录或验证。");
      return { text: readable.slice(0, MAX_SOURCE_LENGTH), finalUrl: current.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("岗位链接暂时无法读取");
}

async function extractFileText(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("文件不能超过 4MB，请压缩 PDF 或上传文字版");
  const filename = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (filename.endsWith(".pdf")) return extractPdfText(buffer);
  if (filename.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (filename.endsWith(".txt") || filename.endsWith(".md")) return buffer.toString("utf8");
  throw new Error("支持 PDF、DOCX、TXT 或 Markdown 文件");
}

async function readIntake(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let sourceText = "";
  let sourceLabel = "粘贴内容";
  let requestId = "";
  let materialKindHint = "";
  let saveOnly = false;
  let structured = { company: "", role: "", location: "", jdText: "", resumeText: "" };

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    saveOnly = form.get("mode") === "save_only";
    requestId = String(form.get("requestId") || "").trim();
    materialKindHint = String(form.get("materialKindHint") || "").trim();
    structured = {
      company: String(form.get("company") || "").trim(),
      role: String(form.get("role") || "").trim(),
      location: String(form.get("location") || "").trim(),
      jdText: String(form.get("jdText") || "").trim(),
      resumeText: String(form.get("resumeText") || "").trim(),
    };
    const file = form.get("file");
    sourceText = String(form.get("sourceText") || "").trim();
    if (file instanceof File && file.size > 0) {
      const fileText = (await extractFileText(file)).trim();
      if (!fileText) throw new Error("文件里没有读到可用文字");
      if (materialKindHint === "preparation") structured.resumeText = fileText;
      sourceText = [sourceText, fileText].filter(Boolean).join("\n\n");
      sourceLabel = `文件导入 · ${file.name.slice(0, 80)}`;
    }
  } else {
    const body = await request.json();
    saveOnly = body.mode === "save_only";
    requestId = String(body.requestId || "").trim();
    materialKindHint = String(body.materialKindHint || "").trim();
    sourceText = String(body.sourceText || "").trim();
    structured = {
      company: String(body.company || "").trim(),
      role: String(body.role || "").trim(),
      location: String(body.location || "").trim(),
      jdText: String(body.jdText || "").trim(),
      resumeText: String(body.resumeText || "").trim(),
    };
  }

  if (!sourceText && structured.company && structured.role && structured.jdText) return { ...structured, saveOnly, requestId, materialKindHint, sourceLabel: "网页填写" };
  if (!sourceText && structured.resumeText) return { ...structured, saveOnly, requestId, materialKindHint:materialKindHint || "preparation", sourceLabel:"网页填写" };
  if (!sourceText) throw new Error("请粘贴岗位、简历或求职目标，或选择一份文件");

  const jobUrl = extractStandaloneJobUrl(sourceText);
  if (jobUrl) {
    const page = await fetchPublicPage(jobUrl);
    sourceText = `来源链接：${page.finalUrl}\n\n${page.text}`;
    sourceLabel = "岗位链接导入";
  }
  if (["job", "resume", "experience"].includes(materialKindHint)) {
    const merged = mergeOpportunityMaterial({
      kind: materialKindHint,
      sourceText,
      jdText: structured.jdText,
      resumeText: structured.resumeText,
      maxLength: MAX_SOURCE_LENGTH,
    });
    sourceLabel = materialKindHint === "job" ? sourceLabel : materialKindHint === "resume" ? "补充简历" : "补充经历";
    return { ...structured, ...merged, saveOnly, requestId, materialKindHint, sourceLabel };
  }
  return { ...structured, saveOnly, requestId, materialKindHint, jdText: sourceText.slice(0, MAX_SOURCE_LENGTH), sourceLabel };
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const supplied = request.headers.get("X-Intake-Request-Id") || "";
  const supportId = /^[a-zA-Z0-9_-]{8,180}$/.test(supplied) ? supplied : crypto.randomUUID();
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) return analyzeRequest(request, user.id);
  const encoder = new TextEncoder();
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (disconnected) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { disconnected = true; }
      };
      try {
        const response = await analyzeRequest(request, user.id, phase => send({ type: "progress", phase, requestId: supportId }));
        const data = await response.json();
        send({ type: "result", data: { ...data, recoveryAction: response.headers.get("TokenDance-Recovery-Action") || data.recoveryAction, status: response.status, requestId: supportId } });
      } catch {
        send({ type: "result", data: { ok: false, status: 503, requestId: supportId, error: "整理暂时失败，材料仍在，请重试" } });
      } finally { if (!disconnected) controller.close(); }
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no", "X-Intake-Request-Id": supportId } });
}

async function analyzeRequest(request: Request, userId: string, report: (phase: IntakePhase) => void = () => {}) {

  let reservation: QuotaReservation | null = null;
  let extracted: Awaited<ReturnType<typeof readIntake>> | null = null;
  try {
    report("reading");
    const intake = await readIntake(request);
    extracted = intake;
    if(intake.saveOnly){
      const input=preserveUnclassifiedIntake(intake);
      return NextResponse.json(input?{ok:true,input,analysis:null,savedOnly:true}:{ok:false,error:"没有读到可保存的文字"},{status:input?200:422});
    }
    const requestId = intake.requestId && /^[a-zA-Z0-9_-]{8,180}$/.test(intake.requestId)
      ? intake.requestId
      : crypto.randomUUID();
    reservation = await reserveQuota(userId, "chat", `opportunity-analysis:${requestId}`);
    if (!reservation) {
      const input=preserveUnclassifiedIntake(intake);
      if(input)return NextResponse.json({ok:true,input,analysis:null,analysisDeferred:true,reasonCode:"user_quota_exhausted",retryable:false,needUpgrade:true,error:"原文可先保存；聊天额度已用完，未调用 AI。补充额度后可继续分析。"});
      return NextResponse.json({ ok: false, error: "聊天额度已用完", needUpgrade: true }, { status: 403 });
    }
    const knowledge = await buildAgentKnowledgeContext({
      task: "job_analysis",
      company: intake.company,
      role: intake.role,
      query: [intake.company, intake.role, intake.jdText.slice(0, 240)].filter(Boolean).join(" "),
      limit: 5,
    });
    report("analyzing");
    const result = await runWithGenerationContext({
      userId,
      operation: "opportunity_analysis",
      requestId,
      knowledgeDocumentIds: knowledge.items.map((item) => item.id),
    }, () => callLLM([
      {
        role: "system",
        content: `你是益职的求职材料整理与证据分析模块。用户会给任意原始材料：岗位链接/JD、简历、经历说明或求职目标。你先识别材料类型，再建立岗位作战档案或求职准备档案。

约束：
1. 绝不虚构公司、职位、项目、数字、职责或经验；识别不到就返回空字符串。
2. materialKind=resume 时，原始材料属于用户经历，应进入 resumeText；materialKind=job 时，岗位要求、公司介绍不能进入 resumeText。
3. 没有简历时，证据只能是 missing；表述模糊或数字需核对时用 unverified。
4. 不使用性别、年龄、婚育、民族等与胜任力无关的信息。
5. 岗位档案的每条 evidence 必须能在用户经历原文中找到；否则写明“尚无证据”。准备档案可以评估材料完整度，但不能虚构目标岗位要求。
6. materialKind=job 或 mixed 时，jdText 只保留岗位职责、要求、公司与岗位相关信息；materialKind=resume 或 goal 时 jdText 必须为空。
7. 内部知识库只用于识别岗位常见考察方向，不能成为用户经历证据，也不能覆盖当前 JD。
8. 只返回 JSON，不要 Markdown。

返回结构：
{
  "materialKind": "job | resume | goal | mixed",
  "company": "公司名或空字符串",
  "role": "职位名；准备阶段填材料中明确的目标岗位，无法识别则为空字符串",
  "location": "地点或空字符串",
  "jdText": "整理后的完整 JD 或空字符串",
  "resumeText": "材料中明确属于用户的经历原文或空字符串",
  "recommendation": "apply | prepare_then_apply | skip",
  "recommendationLabel": "优先投递 | 补充后投递 | 暂不投入",
  "recommendationReason": "一到两句具体理由",
  "requirements": [{"requirement":"JD 关键要求；准备档案则为材料完整度或目标清晰度","importance":"critical | important | supporting","strength":"strong | weak | missing | unverified","evidence":"真实经历或尚无证据","source":"简历中的可追溯位置或 null","verified":true}],
  "actions": [{"title":"具体下一步","reason":"为什么它优先","dueLabel":"今天 | 投递前 | 本周","priority":"urgent | high | normal"}],
  "interviewFocus": [{"question":"可直接练习的问题","rationale":"为什么会问","readiness":"ready | practice | missing"}]
}`,
      },
      {
        role: "user",
        content: `已有公司：${intake.company || "（待识别）"}\n已有职位：${intake.role || "（待识别）"}\n已有地点：${intake.location || "（待识别）"}\n本次补充：${intake.materialKindHint || "首次导入"}\n\n原始材料：\n${wrapExternalMaterial(intake.jdText)}\n\n另附用户简历或经历：\n${wrapExternalMaterial(intake.resumeText || "（未提供）")}${knowledge.contextText ? `\n\n${knowledge.contextText}` : ""}`,
      },
    ], { provider: "deepseek", temperature: 0.2, maxTokens: 4000, reasoningBudgetTokens: 2048, responseFormat: "json_object", timeoutMs: 45_000, maxRetries: 0 }));

    report("checking");
    const parsed = asRecord(parseJson(result));
    const kindHint = intake.materialKindHint;
    const isSupplement = kindHint === "job" || kindHint === "resume" || kindHint === "experience";
    const modelKind = ["job", "resume", "goal", "mixed"].includes(String(parsed.materialKind)) ? String(parsed.materialKind) : "job";
    // 补充材料时客户端提示与合并后的原文才是事实：模型只负责分析（要求拆解、
    // 证据强弱、行动项），不得改判档案类型、清空已有 JD、或用自己的转写替换简历原文。
    const materialKind = kindHint === "preparation" ? "goal" : isSupplement ? (intake.jdText ? "mixed" : "resume") : modelKind;
    const workspaceType = materialKind === "job" || materialKind === "mixed" ? "job" : "preparation";
    const company = String(parsed.company || intake.company || (workspaceType === "preparation" ? "求职准备" : "")).trim().slice(0, 120);
    const role = String(parsed.role || intake.role || (workspaceType === "preparation" ? "目标待确认" : "")).trim().slice(0, 160);
    const location = String(parsed.location || intake.location || "").trim().slice(0, 160);
    const jdText = workspaceType === "job" ? String(isSupplement ? intake.jdText : (parsed.jdText || "")).trim().slice(0, MAX_SOURCE_LENGTH) : "";
    // A supplied base resume is factual source text, never an LLM rewrite.
    const resumeText = String(isSupplement ? intake.resumeText : (intake.resumeText || (materialKind === "resume" ? intake.jdText : parsed.resumeText || ""))).trim().slice(0, MAX_SOURCE_LENGTH);
    const profileText = workspaceType === "preparation" ? intake.jdText.trim().slice(0, MAX_SOURCE_LENGTH) : "";
    if (!company || !role || (workspaceType === "job" && !jdText)) {
      await finalizeQuota(reservation, false);
      reservation = null;
      const input = preserveUnclassifiedIntake(intake);
      const missingFields = [!company && "company", !role && "role", workspaceType === "job" && !jdText && "jdText"].filter(Boolean);
      if (input) return NextResponse.json({ok:true,input,analysis:null,analysisDeferred:true,reasonCode:"classification_incomplete",missingFields,error:"原文已读取，将先建立待确认档案。请确认这是简历、岗位还是求职方向；无需重复上传。"});
      return NextResponse.json({ ok: false, reasonCode:"no_readable_material", error: "没有读到可保存的文字，请换文字版文件或粘贴内容。" }, { status: 422 });
    }

    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.slice(0, 10).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const importance = String(item.importance || "important");
      const strength = String(item.strength || "unverified") as EvidenceStrength;
      return {
        id: `req-${index + 1}`,
        requirement: String(item.requirement || "未命名要求").slice(0, 500),
        importance: ["critical", "important", "supporting"].includes(importance) ? importance : "important",
        strength: strengths.has(strength) ? strength : "unverified",
        evidence: String(item.evidence || "尚无证据").slice(0, 1000),
        source: item.source ? String(item.source).slice(0, 300) : null,
        verified: Boolean(item.verified && item.source),
      };
    }) : [];
    const evidenceCoverage = requirements.reduce((counts: Record<EvidenceStrength, number>, item: { strength: EvidenceStrength }) => {
      counts[item.strength] += 1;
      return counts;
    }, { strong: 0, weak: 0, missing: 0, unverified: 0 });
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 4).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const priority = String(item.priority || "normal");
      return {
        id: `action-${index + 1}`,
        title: String(item.title || "处理关键证据").slice(0, 300),
        reason: String(item.reason || "提高投递判断的可靠性。").slice(0, 500),
        dueLabel: String(item.dueLabel || "投递前").slice(0, 80),
        priority: ["urgent", "high", "normal"].includes(priority) ? priority : "normal",
        status: "todo",
      };
    }) : [];
    const interviewFocus = Array.isArray(parsed.interviewFocus) ? parsed.interviewFocus.slice(0, 5).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const readiness = String(item.readiness || "practice");
      return {
        id: `focus-${index + 1}`,
        question: String(item.question || "请说明一段相关经历。").slice(0, 500),
        rationale: String(item.rationale || "核对岗位关键要求。").slice(0, 500),
        readiness: ["ready", "practice", "missing"].includes(readiness) ? readiness : "practice",
      };
    }) : [];
    const recommendationValue = String(parsed.recommendation || "");
    const modelGaveVerdict = recommendations.has(recommendationValue as OpportunityRecommendation);
    const recommendation = (modelGaveVerdict ? recommendationValue : "prepare_then_apply") as OpportunityRecommendation;
    const labelByRecommendation: Record<OpportunityRecommendation, string> = {
      apply: "优先投递",
      prepare_then_apply: "补充后投递",
      skip: "暂不投入",
    };
    await finalizeQuota(reservation, true);
    const quota = { source: reservation.source, remaining: reservation.remaining };
    reservation = null;
    return NextResponse.json({
      ok: true,
      quota,
      input: { workspaceType, company, role, location, jdText, resumeText, profileText, sourceLabel: intake.sourceLabel },
      analysis: {
        recommendation,
        recommendationLabel: String(parsed.recommendationLabel || (modelGaveVerdict ? labelByRecommendation[recommendation] : "等待完成分析")).slice(0, 80),
        recommendationReason: String(parsed.recommendationReason || (modelGaveVerdict ? "还需补充关键证据。" : "本次分析未形成可靠结论，可重试或继续补充材料。")).slice(0, 800),
        evidenceCoverage,
        requirements,
        actions,
        interviewFocus,
      },
    });
  } catch (error) {
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Opportunity quota refund failed", refundError));
    console.error("Opportunity analysis failed", error);
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    // A hosted balance outage must not prevent accepting the user's material.
    // Unknown text stays in source notes: no invented company, JD or verdict.
    if (extracted && isHostedIntakeQuotaFailure(error)) {
      const input = preserveUnclassifiedIntake(extracted);
      if (input) return NextResponse.json({
        ok: true, input, analysis: null, analysisDeferred: true,
        reasonCode: "hosted_provider_quota", retryable: false,
        error: "材料已读取，站点的 AI 服务额度暂时用完；原文会先保存，服务恢复后再分析。",
      });
    }
    // Only after successful text extraction and a transient/empty model response.
    // Original material is preserved; there is explicitly no reliable analysis.
    const detail=error instanceof Error?error.message:"";
    if(extracted&&(error instanceof SyntaxError||/timeout|timed out|gateway|empty response|未返回可解析|connection|fetch failed|502|503|504/i.test(detail))){
      const input=preserveUnclassifiedIntake(extracted);
      const reasonCode=/timeout|timed out/i.test(detail)?"model_timeout":error instanceof SyntaxError||/未返回可解析|empty response/i.test(detail)?"model_output_invalid":"model_unavailable";
      if(input)return NextResponse.json({ok:true,input,analysis:null,analysisDeferred:true,reasonCode,retryable:true,error:"材料已读取，AI 分析未完成；先保存原文，稍后可以继续分析。本次未扣额度。"});
    }
    const message = intakeErrorMessage(error);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
