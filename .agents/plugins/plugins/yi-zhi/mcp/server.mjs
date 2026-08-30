#!/usr/bin/env node

import { createInterface } from "node:readline";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.env.YI_ZHI_DATA_DIR || join(homedir(), ".yi-zhi");
const STATE_FILE = join(DATA_DIR, "cockpit.json");
const ARTIFACT_DIR = join(DATA_DIR, "artifacts");
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RELEASE_FILE = process.env.YI_ZHI_RELEASE_FILE || join(PLUGIN_ROOT, "release.json");
const UPDATE_STATE_FILE = join(DATA_DIR, "update-state.json");
const UPDATE_MANIFEST_URL = process.env.YI_ZHI_UPDATE_MANIFEST_URL || "https://www.ai-job-coach.xin/api/agent/release";
const UPDATE_CHECK_MS = Math.max(Number(process.env.YI_ZHI_UPDATE_CHECK_MS ?? 7 * 24 * 60 * 60 * 1000), 0);
const UPDATE_RETRY_MS = Math.max(Number(process.env.YI_ZHI_UPDATE_RETRY_MS ?? 24 * 60 * 60 * 1000), 60_000);
const UPDATE_TIMEOUT_MS = Math.min(Math.max(Number(process.env.YI_ZHI_UPDATE_TIMEOUT_MS ?? 5_000), 500), 15_000);
const KNOWLEDGE_FILENAME = join("knowledge", "knowledge-documents.json");
const KNOWLEDGE_FILE = process.env.YI_ZHI_KNOWLEDGE_FILE || join(PLUGIN_ROOT, KNOWLEDGE_FILENAME);
const KNOWLEDGE_REFRESH_MS = Math.max(Number(process.env.YI_ZHI_KNOWLEDGE_REFRESH_MS ?? 15_000), 0);
const MAX_TEXT = 200_000;
let cockpitOrigin = "";
let cockpitServer;
let knowledgeCache;
let knowledgeCachePath = "";
let knowledgeCheckedAt = 0;
let installedReleaseCache;
let updateStatus;
let updateNoticeDelivered = false;

const toolDefinitions = [
  {
    name: "yi_zhi_check_update",
    description: "Check whether this local 益职 Plugin is current. The MCP performs this check automatically at most once per week when the Agent starts; call with force=true only when the user explicitly asks to check now. This never installs an update or reads job-search materials.",
    inputSchema: {
      type: "object",
      properties: { force: { type: "boolean", default: false, description: "Ignore the weekly cache and check the stable release manifest now." } },
      additionalProperties: false
    },
    annotations: { title: "Check 益职 update", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "yi_zhi_retrieve_knowledge",
    description: "Retrieve synthesized, source-grounded 益职 knowledge documents for the current job-search task. Each document declares its Description, Goal, scope, usage boundaries, confidence, and evidence. Use results to guide the next action; never treat a single interview story as an official company rule.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "The current job, JD, interview question, or job-search problem." },
        company: { type: "string", description: "Target company, if known." },
        role: { type: "string", description: "Target role, if known." },
        stage: { type: "string", description: "Current stage or interview round, if known." },
        limit: { type: "integer", minimum: 1, maximum: 8, default: 5 }
      },
      additionalProperties: false
    },
    annotations: { title: "Retrieve 益职 knowledge", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_create_case",
    description: "Create a private local job-search case from any useful starting material: a role, resume, experience note, interview, or job-search goal. A JD is not required.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_type: { type: "string", enum: ["job", "preparation"], description: "Use preparation when there is no concrete JD yet." },
        company: { type: "string", description: "Target company, if known." },
        role: { type: "string", description: "Target role, if known." },
        stage: { type: "string", description: "Current job-search stage." },
        next_action: { type: "string", description: "One concrete next action." },
        materials: { type: "array", items: { type: "string" }, description: "Material types only; never raw private contents." },
        scheduled_at: { type: "string", description: "Optional ISO date-time for the next interview or deadline." }
      },
      additionalProperties: false
    },
    annotations: { title: "Create 益职 case", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "yi_zhi_plan_today",
    description: "Compare every local case and choose the single most valuable action for today. Call this when the user returns, asks what to do, or has several active applications.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Plan today's job-search action", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_get_cockpit",
    description: "Open the active private local 益职 job-search cockpit, or a specific case. Returns a browser link plus the current state so the user can continue across conversations.",
    inputSchema: {
      type: "object",
      properties: { case_id: { type: "string", description: "Optional case ID; defaults to the active case." } },
      additionalProperties: false
    },
    annotations: { title: "Open 益职 cockpit", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_get_cockpit_url",
    description: "Return the live local browser URL for the 益职 job-search cockpit. Present the returned link to the user instead of dumping a long report into chat.",
    inputSchema: {
      type: "object",
      properties: { case_id: { type: "string", description: "Optional case ID to open." } },
      additionalProperties: false
    },
    annotations: { title: "Open 益职 in browser", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_update_cockpit",
    description: "Update the stage, available materials, and one next action in a private local job-search case.",
    inputSchema: {
      type: "object",
      required: ["case_id"],
      properties: {
        case_id: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        stage: { type: "string" },
        materials: { type: "array", items: { type: "string" }, description: "Material types only, such as JD, resume, interview notes. Do not include document contents." },
        next_action: { type: "string" }
        ,scheduled_at: { type: "string", description: "Optional ISO date-time for interview or deadline." }
      },
      additionalProperties: false
    },
    annotations: { title: "Update 益职 cockpit", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_record_fact",
    description: "Record one user-confirmed career fact in the private local truth source. Call only after the job seeker stated or explicitly confirmed the fact. Never infer metrics, ownership, dates, titles, or outcomes.",
    inputSchema: {
      type: "object", required: ["case_id", "text", "confirmed_by_user"],
      properties: {
        case_id: { type: "string" }, text: { type: "string" }, source_excerpt: { type: "string" },
        visibility: { type: "string", enum: ["private", "recruiter_safe"], default: "private" },
        confirmed_by_user: { type: "boolean", description: "Must be true only when the user stated or explicitly confirmed this fact." }
      }, additionalProperties: false
    },
    annotations: { title: "Record confirmed career fact", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_freeze_snapshot",
    description: "Freeze an immutable version of a JD, resume, application answer, interview record, or outcome in the private local case. Use this at every real stage transition so later work uses the exact submitted version.",
    inputSchema: {
      type: "object", required: ["case_id", "type", "title", "content"],
      properties: {
        case_id: { type: "string" },
        type: { type: "string", enum: ["jd", "base_resume", "submitted_resume", "application_answers", "interview_brief", "interview_feedback", "outcome"] },
        title: { type: "string" }, content: { type: "string" },
        quality: { type: "object", description: "Optional facts/reviewer/ATS/PDF review statuses." }
      }, additionalProperties: false
    },
    annotations: { title: "Freeze job-search version", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_get_application_context",
    description: "Return the case's confirmed facts, immutable snapshots, and artifacts before drafting or reviewing any resume, application answer, or interview material. This is the canonical local context; do not rely on chat memory alone.",
    inputSchema: { type: "object", required: ["case_id"], properties: { case_id: { type: "string" } }, additionalProperties: false },
    annotations: { title: "Read canonical application context", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "yi_zhi_save_artifact",
    description: "Save a finished job-fit card, tailored resume, mock-interview report, or interview review as a private local Markdown artifact. Never use this for raw interview transcripts unless the user explicitly asks.",
    inputSchema: {
      type: "object",
      required: ["case_id", "type", "title", "content"],
      properties: {
        case_id: { type: "string" },
        type: { type: "string", enum: ["job-fit", "resume", "mock-interview", "interview-review", "other"] },
        title: { type: "string" },
        content: { type: "string", description: "Completed Markdown artifact." },
        claim_ids: { type: "array", items: { type: "string" }, description: "Confirmed local fact IDs supporting this artifact." },
        quality: { type: "object", description: "Optional independent-review, facts, ATS, and PDF statuses." }
      },
      additionalProperties: false
    },
    annotations: { title: "Save 益职 artifact", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
];

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new Error("Expected text input.");
  const text = value.trim();
  if (text.length > MAX_TEXT) throw new Error("Text input is too large.");
  return text;
}

function validRelease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid 益职 release manifest.");
  if (value.schema_version !== 1 || value.product !== "yi-zhi" || value.channel !== "stable") throw new Error("Unexpected 益职 release manifest.");
  if (!/^\d+\.\d+\.\d+$/.test(value.version || "")) throw new Error("Invalid 益职 release version.");
  const updateUrl = new URL(value.update_url);
  if (updateUrl.protocol !== "https:" || !["ai-job-coach.xin", "www.ai-job-coach.xin"].includes(updateUrl.hostname)) throw new Error("Untrusted 益职 update URL.");
  return {
    schema_version: 1,
    product: "yi-zhi",
    channel: "stable",
    version: value.version,
    released_at: cleanText(value.released_at).slice(0, 40),
    update_url: updateUrl.toString(),
    release_notes: cleanText(value.release_notes).slice(0, 300)
  };
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function loadInstalledRelease() {
  if (installedReleaseCache) return installedReleaseCache;
  installedReleaseCache = validRelease(JSON.parse(await readFile(RELEASE_FILE, "utf8")));
  return installedReleaseCache;
}

async function loadUpdateState() {
  try {
    const parsed = JSON.parse(await readFile(UPDATE_STATE_FILE, "utf8"));
    if (parsed?.schema_version === 1 && parsed.product === "yi-zhi") return parsed;
  } catch (error) {
    if (error?.code !== "ENOENT") return null;
  }
  return null;
}

async function saveUpdateState(state) {
  await mkdir(dirname(UPDATE_STATE_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${UPDATE_STATE_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, UPDATE_STATE_FILE);
}

function publicUpdateStatus(status = updateStatus) {
  if (!status) return null;
  return {
    current_version: status.current_version,
    latest_version: status.latest_version,
    update_available: Boolean(status.update_available),
    checked_at: status.checked_at,
    next_check_at: status.next_check_at,
    update_url: status.update_url,
    release_notes: status.release_notes,
    check_error: status.check_error || null
  };
}

async function checkForUpdate({ force = false } = {}) {
  const installed = await loadInstalledRelease();
  const cached = await loadUpdateState();
  const now = Date.now();
  const nextCheckAt = Date.parse(cached?.next_check_at || "");
  if (!force && cached && Number.isFinite(nextCheckAt) && now < nextCheckAt) {
    const latestVersion = /^\d+\.\d+\.\d+$/.test(cached.latest_version || "")
      ? cached.latest_version
      : installed.version;
    updateStatus = {
      ...cached,
      current_version: installed.version,
      latest_version: latestVersion,
      update_available: compareVersions(latestVersion, installed.version) > 0
    };
    return updateStatus;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
      signal: controller.signal,
      headers: { "User-Agent": `YiZhiJobCoach/${installed.version}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 16_000) throw new Error("release manifest is too large");
    const latest = validRelease(JSON.parse(body));
    const checkedAt = new Date(now).toISOString();
    updateStatus = {
      schema_version: 1,
      product: "yi-zhi",
      current_version: installed.version,
      latest_version: latest.version,
      update_available: compareVersions(latest.version, installed.version) > 0,
      checked_at: checkedAt,
      next_check_at: new Date(now + UPDATE_CHECK_MS).toISOString(),
      update_url: latest.update_url,
      release_notes: latest.release_notes,
      check_error: null
    };
  } catch (error) {
    const cachedLatestVersion = /^\d+\.\d+\.\d+$/.test(cached?.latest_version || "")
      ? cached.latest_version
      : installed.version;
    updateStatus = {
      schema_version: 1,
      product: "yi-zhi",
      current_version: installed.version,
      latest_version: cachedLatestVersion,
      update_available: compareVersions(cachedLatestVersion, installed.version) > 0,
      checked_at: new Date(now).toISOString(),
      next_check_at: new Date(now + UPDATE_RETRY_MS).toISOString(),
      update_url: cached?.update_url || installed.update_url,
      release_notes: cached?.release_notes || "",
      check_error: error instanceof Error ? error.message.slice(0, 160) : "update check failed"
    };
  } finally {
    clearTimeout(timeout);
  }
  await saveUpdateState(updateStatus);
  return updateStatus;
}

function updateStatusText(status) {
  if (status.update_available) {
    return `益职可更新：${status.current_version} → ${status.latest_version}\n${status.release_notes || "包含新的求职工作流和稳定性改进。"}\n更新说明：${status.update_url}`;
  }
  if (status.check_error) return `当前版本：${status.current_version}\n本次检查未完成，将在稍后自动重试。`;
  return `益职已是最新版本：${status.current_version}\n下次自动检查：${status.next_check_at}`;
}

function safeId(value) {
  const id = cleanText(value);
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid case ID.");
  return id;
}

function safeFilename(value) {
  const normalized = cleanText(value, "artifact")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || "artifact";
}

async function loadKnowledge() {
  const now = Date.now();
  if (knowledgeCache && now - knowledgeCheckedAt < KNOWLEDGE_REFRESH_MS) return knowledgeCache;
  knowledgeCheckedAt = now;

  const candidates = [KNOWLEDGE_FILE];
  const versionRoot = dirname(PLUGIN_ROOT);

  // Codex removes the previous version directory during an in-place Plugin
  // update. A running server can fall forward to the newly installed sibling.
  if (versionRoot.includes(join(".codex", "plugins", "cache"))) {
    try {
      const siblings = await readdir(versionRoot, { withFileTypes: true });
      for (const sibling of siblings.filter((entry) => entry.isDirectory())) {
        const candidate = join(versionRoot, sibling.name, KNOWLEDGE_FILENAME);
        if (!candidates.includes(candidate)) candidates.push(candidate);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const available = [];
  let lastError;
  for (const candidate of candidates) {
    try {
      available.push({ path: candidate, modifiedAt: (await stat(candidate)).mtimeMs });
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") throw error;
    }
  }

  available.sort((a, b) => b.modifiedAt - a.modifiedAt || b.path.localeCompare(a.path));
  for (const candidate of available) {
    try {
      if (knowledgeCache && candidate.path === knowledgeCachePath) return knowledgeCache;
      const parsed = JSON.parse(await readFile(candidate.path, "utf8"));
      if (!Array.isArray(parsed?.documents) || !parsed.description || !parsed.goal) {
        throw new Error("Invalid 益职 knowledge base.");
      }
      knowledgeCache = parsed;
      knowledgeCachePath = candidate.path;
      return knowledgeCache;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT" && !knowledgeCache) throw error;
    }
  }
  if (knowledgeCache) return knowledgeCache;
  throw new Error(`益职知识库文件不可用：${lastError?.message || "not found"}`);
}

function normalized(value) {
  return cleanText(value).toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function normalizedTag(value) {
  return normalized(value).replace(/[\s·._/-]+/g, "");
}

function queryTerms(value) {
  const text = normalized(value);
  const weighted = new Map();
  const add = (term, weight) => {
    if (term.length < 2) return;
    weighted.set(term, Math.max(weighted.get(term) || 0, weight));
  };
  for (const token of text.split(/[\s,，。；;、:：/|()（）\[\]【】]+/).filter(Boolean)) {
    if (/^[a-z0-9+.#-]+$/i.test(token)) add(token, token.length >= 4 ? 4 : 2);
    for (const run of token.match(/[\p{Script=Han}]+/gu) || []) {
      for (const size of [4, 3, 2]) {
        for (let index = 0; index <= run.length - size; index += 1) add(run.slice(index, index + size), size === 4 ? 4 : size === 3 ? 2 : 1);
      }
    }
  }
  return [...weighted.entries()].slice(0, 120).map(([term, weight]) => ({ term, weight }));
}

function scoreKnowledge(item, args) {
  const company = normalizedTag(args.company);
  const role = normalizedTag(args.role);
  const stage = normalizedTag(args.stage);
  const haystack = normalized([
    item.title,
    item.description,
    item.goal,
    item.scope,
    ...(item.use_when || []),
    item.content
  ].filter(Boolean).join(" "));
  let score = 0;
  if (company && (item.companies || []).some((entry) => normalizedTag(entry).includes(company) || company.includes(normalizedTag(entry)))) score += 24;
  else if (company && (item.companies || []).length) score -= 6;
  const roleMatches = role && (item.roles || []).some((entry) => normalizedTag(entry).includes(role) || role.includes(normalizedTag(entry)));
  if (roleMatches) score += 16;
  else if (role && (item.roles || []).length) return Number.NEGATIVE_INFINITY;
  if (stage && (item.stages || []).some((entry) => normalizedTag(entry).includes(stage) || stage.includes(normalizedTag(entry)))) score += 10;
  let lexicalScore = 0;
  for (const { term, weight } of queryTerms(args.query)) {
    if (haystack.includes(term)) lexicalScore += weight;
  }
  return score + Math.min(lexicalScore, 36);
}

async function retrieveKnowledge(args) {
  const query = cleanText(args.query);
  if (!query) throw new Error("Knowledge query is required.");
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 8);
  const knowledge = await loadKnowledge();
  return knowledge.documents
    .map((item) => ({ item, score: scoreKnowledge(item, args) }))
    .filter((entry) => entry.item.status === "active" && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function knowledgeText(items) {
  if (!items.length) return "益职知识库没有找到足够相关的知识文档。继续基于当前 JD 和用户真实材料工作，不要编造来源。";
  const entries = items.map((item, index) => [
    `[KNOWLEDGE${index + 1}] ${item.title}`,
    `Description：${item.description}`,
    `Goal：${item.goal}`,
    `适用范围：${item.scope}`,
    `适用：${[...(item.companies || []), ...(item.roles || []), ...(item.stages || [])].filter(Boolean).join(" / ")}`,
    `适合使用：${(item.use_when || []).join("；") || "—"}`,
    `不要用于：${(item.do_not_use_when || []).join("；") || "—"}`,
    `知识正文：\n${item.content}`,
    `证据来源：${(item.evidence || []).map((source) => `${source.title}（${source.platform}）${source.url}`).join("；") || "—"}`,
    `置信度：${item.confidence}；复核日期：${item.reviewed_at}`
  ].filter(Boolean).join("\n"));
  return `益职内部求职知识库\n规则：当前 JD 和用户事实优先；知识文档用于指导行动；个体面经不是公司官方题库；不得把外部案例写成用户经历。\n\n${entries.join("\n\n")}`;
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (parsed?.version === 1 && parsed.cases && typeof parsed.cases === "object") {
      for (const item of Object.values(parsed.cases)) {
        item.facts = Array.isArray(item.facts) ? item.facts : [];
        item.snapshots = Array.isArray(item.snapshots) ? item.snapshots : [];
        item.artifacts = Array.isArray(item.artifacts) ? item.artifacts : [];
      }
      return parsed;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { version: 1, active_case_id: null, cases: {} };
}

async function saveState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, STATE_FILE);
}

function cockpitText(item) {
  return [
    "益职求职作战台",
    `事项 ID：${item.id}`,
    `目标：${[item.company, item.role].filter(Boolean).join(" / ") || "待确认"}`,
    `当前阶段：${item.stage || "定位下一步"}`,
    `已有材料：${item.materials.length ? item.materials.join("、") : "—"}`,
    `确认事实：${item.facts.length} 条`,
    `冻结版本：${item.snapshots.length} 个`,
    `产物：${item.artifacts.length ? `${item.artifacts.length} 份` : "—"}`,
    `下一动作：${item.next_action || "确认当前最急的问题"}`
  ].join("\n");
}

function cockpitUrl(caseId) {
  const url = new URL(cockpitOrigin);
  if (caseId) url.searchParams.set("case", caseId);
  return url.toString();
}

function casePriority(item, now = new Date()) {
  const stage = normalized(item.stage);
  const action = normalized(item.next_action);
  let score = 10;
  if (/面试|interview/.test(stage)) score += 60;
  else if (/复盘|review/.test(stage)) score += 54;
  else if (/投递|apply|简历/.test(stage)) score += 30;
  if (/今天|立即|确认|缺口|面试|复盘/.test(action)) score += 24;
  if (/简历|投递/.test(action)) score += 14;
  if (item.scheduled_at) {
    const days = Math.ceil((new Date(item.scheduled_at).getTime() - now.getTime()) / 86_400_000);
    if (Number.isFinite(days)) score += days <= 0 ? 80 : days === 1 ? 65 : days <= 3 ? 45 : 0;
  }
  return score;
}

function planToday(state) {
  const cases = Object.values(state.cases).filter((item) => !/已结束|放弃|归档|won|lost|withdrawn|archived/i.test(item.stage || ""));
  const ranked = cases.sort((a, b) => casePriority(b) - casePriority(a) || b.updated_at.localeCompare(a.updated_at));
  return { focus: ranked[0] || null, cases: ranked };
}

function result(text, data, openCaseId) {
  const url = openCaseId ? cockpitUrl(openCaseId) : null;
  const shouldNotifyUpdate = Boolean(updateStatus?.update_available) && !updateNoticeDelivered;
  const updateNotice = shouldNotifyUpdate ? `\n\n${updateStatusText(updateStatus)}` : "";
  if (shouldNotifyUpdate) updateNoticeDelivered = true;
  const content = [{ type: "text", text: `${url ? `${text}\n\n打开本地作战盘：${url}` : text}${updateNotice}` }];
  if (url) content.push({ type: "resource_link", uri: url, name: "益职求职作战盘", title: "在浏览器中打开益职" });
  const structuredContent = url ? { ...data, cockpit_url: url } : { ...data };
  const publicUpdate = publicUpdateStatus();
  if (publicUpdate) structuredContent.update = publicUpdate;
  return { content, structuredContent, isError: false };
}

async function callTool(name, args = {}) {
  const state = await loadState();

  if (name === "yi_zhi_check_update") {
    const status = await checkForUpdate({ force: args.force === true });
    updateNoticeDelivered = true;
    return result(updateStatusText(status), { update: publicUpdateStatus(status) });
  }

  if (name === "yi_zhi_retrieve_knowledge") {
    const items = await retrieveKnowledge(args);
    return result(knowledgeText(items), { items });
  }

  if (name === "yi_zhi_plan_today") {
    const plan = planToday(state);
    if (!plan.focus) return result("今日 ToDo 1\n先把一份现有材料交给我：简历、岗位链接、经历说明或求职目标任选一个。", { focus: null, cases: [] });
    return result(`今日 ToDo 1\n${plan.focus.company || "求职准备"} · ${plan.focus.role || "目标待确认"}\n${plan.focus.next_action || "确认当前最急的问题"}`, plan, plan.focus.id);
  }

  if (name === "yi_zhi_create_case") {
    const now = new Date().toISOString();
    const id = `case-${randomUUID()}`;
    const item = {
      id,
      workspace_type: args.workspace_type === "preparation" ? "preparation" : "job",
      company: cleanText(args.company),
      role: cleanText(args.role),
      stage: cleanText(args.stage, "定位下一步"),
      materials: Array.isArray(args.materials) ? [...new Set(args.materials.map((entry) => cleanText(entry)).filter(Boolean))].slice(0, 20) : [],
      next_action: cleanText(args.next_action, "确认当前最急的问题"),
      scheduled_at: cleanText(args.scheduled_at),
      artifacts: [],
      facts: [],
      snapshots: [],
      created_at: now,
      updated_at: now
    };
    state.cases[id] = item;
    state.active_case_id = id;
    await saveState(state);
    return result(cockpitText(item), { case: item }, item.id);
  }

  const requestedId = args.case_id ? safeId(args.case_id) : state.active_case_id;
  if (!requestedId || !state.cases[requestedId]) throw new Error("No matching 益职 case. Create one first.");
  const item = state.cases[requestedId];

  if (name === "yi_zhi_get_cockpit" || name === "yi_zhi_get_cockpit_url") {
    return result(cockpitText(item), { case: item }, item.id);
  }

  if (name === "yi_zhi_update_cockpit") {
    for (const key of ["company", "role", "stage", "next_action", "scheduled_at"]) {
      if (args[key] !== undefined) item[key] = cleanText(args[key]);
    }
    if (args.materials !== undefined) {
      if (!Array.isArray(args.materials) || args.materials.length > 20) throw new Error("Invalid materials list.");
      item.materials = [...new Set(args.materials.map((entry) => cleanText(entry)).filter(Boolean))];
    }
    item.updated_at = new Date().toISOString();
    state.active_case_id = item.id;
    await saveState(state);
    return result(cockpitText(item), { case: item }, item.id);
  }

  if (name === "yi_zhi_record_fact") {
    if (args.confirmed_by_user !== true) throw new Error("只有用户明确陈述或确认的内容才能进入事实库。");
    const text = cleanText(args.text);
    if (!text) throw new Error("Fact text is required.");
    const fingerprint = normalized(text);
    let fact = item.facts.find((entry) => entry.fingerprint === fingerprint);
    if (!fact) {
      fact = { id: `fact-${randomUUID()}`, text, source_excerpt: cleanText(args.source_excerpt, text), visibility: args.visibility === "recruiter_safe" ? "recruiter_safe" : "private", status: "confirmed", fingerprint, confirmed_at: new Date().toISOString() };
      item.facts.push(fact);
    }
    item.updated_at = new Date().toISOString();
    await saveState(state);
    return result(`已记录 1 条用户确认事实：${text}`, { fact, case: item }, item.id);
  }

  if (name === "yi_zhi_freeze_snapshot") {
    const type = cleanText(args.type);
    const allowed = ["jd", "base_resume", "submitted_resume", "application_answers", "interview_brief", "interview_feedback", "outcome"];
    if (!allowed.includes(type)) throw new Error("Invalid snapshot type.");
    const title = cleanText(args.title);
    const content = cleanText(args.content);
    const hash = normalized(content);
    let snapshot = item.snapshots.find((entry) => entry.type === type && entry.fingerprint === hash);
    if (!snapshot) {
      const version = Math.max(0, ...item.snapshots.filter((entry) => entry.type === type).map((entry) => Number(entry.version) || 0)) + 1;
      snapshot = { id: `snapshot-${randomUUID()}`, type, version, title, content, fingerprint: hash, quality: args.quality && typeof args.quality === "object" ? args.quality : {}, frozen_at: new Date().toISOString() };
      item.snapshots.push(snapshot);
    }
    item.updated_at = new Date().toISOString();
    await saveState(state);
    return result(`已冻结 ${title} V${snapshot.version}`, { snapshot, case: item }, item.id);
  }

  if (name === "yi_zhi_get_application_context") {
    return result(`已载入 ${item.facts.length} 条确认事实、${item.snapshots.length} 个冻结版本和 ${item.artifacts.length} 份产物。起草时只能使用确认事实；投递前必须完成独立复核、事实、ATS 与 PDF 检查。`, { case: item, confirmed_facts: item.facts, snapshots: item.snapshots, artifacts: item.artifacts }, item.id);
  }

  if (name === "yi_zhi_save_artifact") {
    const type = cleanText(args.type);
    if (!["job-fit", "resume", "mock-interview", "interview-review", "other"].includes(type)) throw new Error("Invalid artifact type.");
    const title = cleanText(args.title);
    const content = cleanText(args.content);
    if (!title || !content) throw new Error("Artifact title and content are required.");
    const artifactId = `artifact-${randomUUID()}`;
    const filename = `${safeFilename(title)}-${artifactId.slice(-8)}.md`;
    const filePath = join(ARTIFACT_DIR, filename);
    await mkdir(ARTIFACT_DIR, { recursive: true, mode: 0o700 });
    await writeFile(filePath, `# ${title}\n\n${content}\n`, { mode: 0o600, flag: "wx" });
    const claimIds = Array.isArray(args.claim_ids) ? [...new Set(args.claim_ids.map((entry) => cleanText(entry)).filter((id) => item.facts.some((fact) => fact.id === id)))] : [];
    const artifact = { id: artifactId, type, title, path: filePath, version: item.artifacts.filter((entry) => entry.type === type).length + 1, claim_ids: claimIds, quality: args.quality && typeof args.quality === "object" ? args.quality : {}, created_at: new Date().toISOString() };
    item.artifacts.push(artifact);
    item.updated_at = artifact.created_at;
    await saveState(state);
    return result(`已保存益职产物：${title}\n本地路径：${filePath}`, { artifact, case: item }, item.id);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cockpitPage(state, selectedId) {
  const cases = Object.values(state.cases).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const today = planToday(state);
  const active = state.cases[selectedId] || today.focus || state.cases[state.active_case_id] || cases[0];
  const list = cases.map((item) => `<a class="case ${item.id === active?.id ? "active" : ""}" href="/?case=${encodeURIComponent(item.id)}"><small>${escapeHtml(item.company || "待确认公司")}</small><strong>${escapeHtml(item.role || "待确认岗位")}</strong><span>${escapeHtml(item.stage || "定位下一步")}</span></a>`).join("");
  const materials = active?.materials?.length ? active.materials.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") : '<span class="muted">尚未记录材料</span>';
  const artifacts = active?.artifacts?.length ? active.artifacts.map((item) => `<li><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.type)}</span></div><code>${escapeHtml(item.path)}</code></li>`).join("") : '<li class="empty">完成岗位判断、简历或复盘后，Agent 会把产物放在这里。</li>';
  const facts = active?.facts?.length ? active.facts.slice(-5).reverse().map((item) => `<li><div><strong>${escapeHtml(item.text)}</strong><span>${item.visibility === "recruiter_safe" ? "可用于对外材料" : "仅私密使用"}</span></div></li>`).join("") : '<li class="empty">Agent 会把你明确确认的经历写进事实源，后续简历只从这里取材。</li>';
  const snapshots = active?.snapshots?.length ? active.snapshots.slice().reverse().slice(0, 8).map((item) => `<li><div><strong>${escapeHtml(item.title)} V${item.version}</strong><span>${escapeHtml(item.type)}</span></div><time>${escapeHtml(new Date(item.frozen_at).toLocaleDateString("zh-CN"))}</time></li>`).join("") : '<li class="empty">JD、投递简历和面试结果会按版本冻结，不再被后续对话覆盖。</li>';
  const updated = active?.updated_at ? new Date(active.updated_at).toLocaleString("zh-CN", { hour12: false }) : "—";
  const updateCard = updateStatus?.update_available ? `<div class="update-card"><small>插件更新</small><strong>${escapeHtml(updateStatus.current_version)} → ${escapeHtml(updateStatus.latest_version)}</strong><p>${escapeHtml(updateStatus.release_notes || "包含新的求职工作流和稳定性改进。")}</p><p>回到 Agent 说“检查益职更新”。</p></div>` : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>益职求职作战盘</title><style>
  :root{color-scheme:light;--ink:#25272d;--muted:#666c76;--line:#dedbd5;--paper:#f7f4ef;--orange:#e9672d;--soft:#fff0e8;--blue:#536fe8}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}header{height:62px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:10px;font-weight:800}.mark{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--orange);color:#fff}.local{padding:4px 9px;border-radius:99px;background:#efede9;color:#5f5b55;font-size:11px}.shell{height:calc(100vh - 62px);display:grid;grid-template-columns:240px 1fr 300px}.rail{padding:22px 12px;background:var(--paper);overflow:auto}.rail.left{border-right:1px solid var(--line)}.rail.right{border-left:1px solid var(--line)}h2{margin:0 6px 14px;font-size:14px}.case{margin:3px 0;padding:13px 12px;display:flex;flex-direction:column;border:1px solid transparent;border-radius:12px;color:inherit;text-decoration:none}.case:hover{background:#fff}.case.active{background:#fff;border-color:#dfbba7}.case small,.case span{color:var(--muted);font-size:11px}.case strong{margin:2px 0 8px}.main{min-width:0;overflow:auto}.title{padding:40px clamp(24px,5vw,68px) 28px;border-bottom:1px solid var(--line)}.title p{margin:0;color:var(--muted)}h1{margin:10px 0;font-size:clamp(28px,4vw,46px);line-height:1.1;letter-spacing:-.04em}.stage{display:inline-flex;padding:4px 9px;border-radius:99px;background:#eef1ff;color:#4057b7;font-size:11px;font-weight:700}.content{max-width:960px;margin:auto;padding:34px clamp(24px,5vw,68px) 70px}.decision{padding:26px;border:1px solid var(--line);border-radius:15px}.decision h2{margin:0 0 8px}.next{margin:10px 0 0;font-size:clamp(18px,2.3vw,25px);font-weight:650}.section{padding:27px 0;border-bottom:1px solid var(--line)}.section h2{margin:0 0 12px}.tags{display:flex;flex-wrap:wrap;gap:8px}.tag{padding:5px 9px;border-radius:99px;background:#f0eee9;font-size:11px}.artifacts{margin:0;padding:0;list-style:none}.artifacts li{padding:14px 0;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.artifacts li div{display:flex;flex-direction:column}.artifacts li span,.muted,.empty{color:var(--muted);font-size:11px}.artifacts code{max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px}.right .next-card,.update-card{padding:16px;border:1px solid #e5cbbc;border-radius:14px;background:#fff}.right .next-card small,.update-card small{color:var(--orange);font-weight:800}.right .next-card strong,.update-card strong{display:block;margin:9px 0 6px}.update-card{margin-top:12px;background:var(--soft)}.right p{color:var(--muted);font-size:11px}.privacy{margin-top:26px;padding-top:18px;border-top:1px solid var(--line)}@media(max-width:900px){.shell{display:block}.rail.left{height:auto;border-right:0;border-bottom:1px solid var(--line);white-space:nowrap}.rail.left h2{display:none}.case{width:210px;display:inline-flex;white-space:normal}.rail.right{border:0;border-top:1px solid var(--line)}.title{padding-top:28px}}@media(max-width:600px){header{height:56px}.shell{height:auto}.local{display:none}.title{padding:24px 18px}.content{padding:24px 18px 50px}.decision{padding:20px}.artifacts li{flex-direction:column}.artifacts code{max-width:100%}}
  </style></head><body><header><div class="brand"><span class="mark">益</span>益职</div><span class="local">本地私密工作区</span></header><div class="shell"><aside class="rail left"><h2>求职事项</h2>${list || '<p class="muted">还没有事项。回到 Agent，交一份简历、岗位或求职目标。</p>'}</aside><main class="main">${active ? `<section class="title"><p>${escapeHtml(active.company || "求职准备")}</p><h1>${escapeHtml(active.role || "目标待确认")}</h1><span class="stage">${escapeHtml(active.stage || "定位下一步")}</span></section><div class="content"><section class="decision"><h2>今日 ToDo <b>1</b></h2><p class="next">${escapeHtml(active.next_action || "确认当前最急的问题")}</p></section><section class="section"><h2>已有材料</h2><div class="tags">${materials}</div></section><section class="section"><h2>确认事实</h2><ul class="artifacts">${facts}</ul></section><section class="section"><h2>岗位版本</h2><ul class="artifacts">${snapshots}</ul></section><section class="section"><h2>Agent 产物</h2><ul class="artifacts">${artifacts}</ul></section><p class="muted">最后更新：${escapeHtml(updated)}</p></div>` : '<div class="content"><h1>先交一份现有材料</h1><p class="muted">简历、岗位链接、经历说明或求职目标任选一个，不需要先有 JD。</p></div>'}</main><aside class="rail right"><h2>导师安排</h2>${active ? `<div class="next-card"><small>比较 ${today.cases.length} 个事项后</small><strong>${escapeHtml(active.next_action || "确认当前最急的问题")}</strong><p>回到 Agent 直接说“继续”，它会先读取事实和岗位版本，再完成这一步。</p></div>` : '<p>交一份材料后，这里会显示最值得做的一件事。</p>'}${updateCard}<div class="privacy"><strong>数据只在本机</strong><p>这张作战盘由 Plugin 在 Agent 沙箱中运行，不会自动上传简历或面试记录。</p></div></aside></div></body></html>`;
}

async function startCockpitServer() {
  cockpitServer = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method !== "GET" || requestUrl.pathname !== "/") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const state = await loadState();
      const html = cockpitPage(state, requestUrl.searchParams.get("case"));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'"
      });
      response.end(html);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("益职作战盘暂时无法读取本地状态，请回到 Agent 重试。");
    }
  });
  await new Promise((resolve, reject) => {
    cockpitServer.once("error", reject);
    cockpitServer.listen(0, "127.0.0.1", resolve);
  });
  const address = cockpitServer.address();
  cockpitOrigin = `http://127.0.0.1:${address.port}/`;
}

function response(id, resultValue) {
  return { jsonrpc: "2.0", id, result: resultValue };
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return errorResponse(message?.id ?? null, -32600, "Invalid Request");
  }
  if (message.id === undefined) return null;

  try {
    if (message.method === "initialize") {
      const release = await loadInstalledRelease();
      const update = await checkForUpdate();
      return response(message.id, {
        protocolVersion: message.params?.protocolVersion || "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "yi-zhi", version: release.version },
        instructions: `Act as a proactive job-search mentor. Start by planning today's highest-value action across all local cases. A JD is not required. Before drafting application material, call yi_zhi_get_application_context; record only user-confirmed facts and freeze every real JD, submitted resume, application answer, interview record, and outcome. A final application package must pass an independent reviewer, facts, ATS, and PDF checks. The connected person is the job seeker, never the owner of the 益职 product.${update.update_available ? ` 益职 ${update.latest_version} is available. Tell the user once and use yi_zhi_check_update for the safe update instructions; never silently overwrite local data.` : " The Plugin checks its stable release at most once per week when this MCP starts."}`
      });
    }
    if (message.method === "ping") return response(message.id, {});
    if (message.method === "tools/list") return response(message.id, { tools: toolDefinitions });
    if (message.method === "tools/call") {
      const name = message.params?.name;
      if (!toolDefinitions.some((tool) => tool.name === name)) return errorResponse(message.id, -32602, `Unknown tool: ${name}`);
      try {
        return response(message.id, await callTool(name, message.params?.arguments || {}));
      } catch (error) {
        return response(message.id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed." }], isError: true });
      }
    }
    return errorResponse(message.id, -32601, "Method not found");
  } catch (error) {
    return errorResponse(message.id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}

async function dispatch(value) {
  const messages = Array.isArray(value) ? value : [value];
  const replies = (await Promise.all(messages.map(handle))).filter(Boolean);
  if (!replies.length) return;
  process.stdout.write(`${JSON.stringify(Array.isArray(value) ? replies : replies[0])}\n`);
}

// Hold a snapshot in memory before a package manager swaps the versioned
// Plugin directory. Cockpit-only use still starts if this preload fails.
await loadKnowledge().catch(() => undefined);
await startCockpitServer();
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let dispatchQueue = Promise.resolve();
input.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    dispatchQueue = dispatchQueue.then(() => dispatch(message)).catch((error) => {
      process.stderr.write(`益职 MCP 请求处理失败：${error instanceof Error ? error.message : "unknown error"}\n`);
    });
  } catch {
    process.stdout.write(`${JSON.stringify(errorResponse(null, -32700, "Parse error"))}\n`);
  }
});
input.on("close", () => cockpitServer?.close());
