#!/usr/bin/env node

import { createInterface } from "node:readline";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.YI_ZHI_DATA_DIR || join(homedir(), ".yi-zhi");
const STATE_FILE = join(DATA_DIR, "cockpit.json");
const ARTIFACT_DIR = join(DATA_DIR, "artifacts");
const MAX_TEXT = 200_000;
let cockpitOrigin = "";
let cockpitServer;

const toolDefinitions = [
  {
    name: "yi_zhi_create_case",
    description: "Create a private local job-search case when the user starts working on a concrete role or interview. Returns the case ID and cockpit state.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Target company, if known." },
        role: { type: "string", description: "Target role, if known." },
        stage: { type: "string", description: "Current job-search stage." },
        next_action: { type: "string", description: "One concrete next action." }
      },
      additionalProperties: false
    },
    annotations: { title: "Create 益职 case", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
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
      },
      additionalProperties: false
    },
    annotations: { title: "Update 益职 cockpit", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
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
        content: { type: "string", description: "Completed Markdown artifact." }
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

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (parsed?.version === 1 && parsed.cases && typeof parsed.cases === "object") return parsed;
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
    `产物：${item.artifacts.length ? `${item.artifacts.length} 份` : "—"}`,
    `下一动作：${item.next_action || "确认当前最急的问题"}`
  ].join("\n");
}

function cockpitUrl(caseId) {
  const url = new URL(cockpitOrigin);
  if (caseId) url.searchParams.set("case", caseId);
  return url.toString();
}

function result(text, data, openCaseId) {
  const url = openCaseId ? cockpitUrl(openCaseId) : null;
  const content = [{ type: "text", text: url ? `${text}\n\n打开本地作战盘：${url}` : text }];
  if (url) content.push({ type: "resource_link", uri: url, name: "益职求职作战盘", title: "在浏览器中打开益职" });
  return { content, structuredContent: url ? { ...data, cockpit_url: url } : data, isError: false };
}

async function callTool(name, args = {}) {
  const state = await loadState();

  if (name === "yi_zhi_create_case") {
    const now = new Date().toISOString();
    const id = `case-${randomUUID()}`;
    const item = {
      id,
      company: cleanText(args.company),
      role: cleanText(args.role),
      stage: cleanText(args.stage, "定位下一步"),
      materials: [],
      next_action: cleanText(args.next_action, "确认当前最急的问题"),
      artifacts: [],
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
    for (const key of ["company", "role", "stage", "next_action"]) {
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
    const artifact = { id: artifactId, type, title, path: filePath, created_at: new Date().toISOString() };
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
  const active = state.cases[selectedId] || state.cases[state.active_case_id] || cases[0];
  const list = cases.map((item) => `<a class="case ${item.id === active?.id ? "active" : ""}" href="/?case=${encodeURIComponent(item.id)}"><small>${escapeHtml(item.company || "待确认公司")}</small><strong>${escapeHtml(item.role || "待确认岗位")}</strong><span>${escapeHtml(item.stage || "定位下一步")}</span></a>`).join("");
  const materials = active?.materials?.length ? active.materials.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") : '<span class="muted">尚未记录材料</span>';
  const artifacts = active?.artifacts?.length ? active.artifacts.map((item) => `<li><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.type)}</span></div><code>${escapeHtml(item.path)}</code></li>`).join("") : '<li class="empty">完成岗位判断、简历或复盘后，Agent 会把产物放在这里。</li>';
  const updated = active?.updated_at ? new Date(active.updated_at).toLocaleString("zh-CN", { hour12: false }) : "—";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>益职求职作战盘</title><style>
  :root{color-scheme:light;--ink:#25272d;--muted:#666c76;--line:#dedbd5;--paper:#f7f4ef;--orange:#e9672d;--soft:#fff0e8;--blue:#536fe8}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}header{height:62px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:10px;font-weight:800}.mark{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--orange);color:#fff}.local{padding:4px 9px;border-radius:99px;background:#efede9;color:#5f5b55;font-size:11px}.shell{height:calc(100vh - 62px);display:grid;grid-template-columns:240px 1fr 300px}.rail{padding:22px 12px;background:var(--paper);overflow:auto}.rail.left{border-right:1px solid var(--line)}.rail.right{border-left:1px solid var(--line)}h2{margin:0 6px 14px;font-size:14px}.case{margin:3px 0;padding:13px 12px;display:flex;flex-direction:column;border:1px solid transparent;border-radius:12px;color:inherit;text-decoration:none}.case:hover{background:#fff}.case.active{background:#fff;border-color:#dfbba7}.case small,.case span{color:var(--muted);font-size:11px}.case strong{margin:2px 0 8px}.main{min-width:0;overflow:auto}.title{padding:40px clamp(24px,5vw,68px) 28px;border-bottom:1px solid var(--line)}.title p{margin:0;color:var(--muted)}h1{margin:10px 0;font-size:clamp(28px,4vw,46px);line-height:1.1;letter-spacing:-.04em}.stage{display:inline-flex;padding:4px 9px;border-radius:99px;background:#eef1ff;color:#4057b7;font-size:11px;font-weight:700}.content{max-width:960px;margin:auto;padding:34px clamp(24px,5vw,68px) 70px}.decision{padding:26px;border:1px solid var(--line);border-radius:15px}.decision h2{margin:0 0 8px}.next{margin:10px 0 0;font-size:clamp(18px,2.3vw,25px);font-weight:650}.section{padding:27px 0;border-bottom:1px solid var(--line)}.section h2{margin:0 0 12px}.tags{display:flex;flex-wrap:wrap;gap:8px}.tag{padding:5px 9px;border-radius:99px;background:#f0eee9;font-size:11px}.artifacts{margin:0;padding:0;list-style:none}.artifacts li{padding:14px 0;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.artifacts li div{display:flex;flex-direction:column}.artifacts li span,.muted,.empty{color:var(--muted);font-size:11px}.artifacts code{max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px}.right .next-card{padding:16px;border:1px solid #e5cbbc;border-radius:14px;background:#fff}.right .next-card small{color:var(--orange);font-weight:800}.right .next-card strong{display:block;margin:9px 0 6px}.right p{color:var(--muted);font-size:11px}.privacy{margin-top:26px;padding-top:18px;border-top:1px solid var(--line)}@media(max-width:900px){.shell{display:block}.rail.left{height:auto;border-right:0;border-bottom:1px solid var(--line);white-space:nowrap}.rail.left h2{display:none}.case{width:210px;display:inline-flex;white-space:normal}.rail.right{border:0;border-top:1px solid var(--line)}.title{padding-top:28px}}@media(max-width:600px){header{height:56px}.shell{height:auto}.local{display:none}.title{padding:24px 18px}.content{padding:24px 18px 50px}.decision{padding:20px}.artifacts li{flex-direction:column}.artifacts code{max-width:100%}}
  </style></head><body><header><div class="brand"><span class="mark">益</span>益职</div><span class="local">本地私密工作区</span></header><div class="shell"><aside class="rail left"><h2>岗位机会</h2>${list || '<p class="muted">还没有机会。回到 Agent，说“用益职收录这个岗位”。</p>'}</aside><main class="main">${active ? `<section class="title"><p>${escapeHtml(active.company || "公司待确认")}</p><h1>${escapeHtml(active.role || "岗位待确认")}</h1><span class="stage">${escapeHtml(active.stage || "定位下一步")}</span></section><div class="content"><section class="decision"><h2>当前最重要的事</h2><p class="next">${escapeHtml(active.next_action || "确认当前最急的问题")}</p></section><section class="section"><h2>已有材料</h2><div class="tags">${materials}</div></section><section class="section"><h2>Agent 产物</h2><ul class="artifacts">${artifacts}</ul></section><p class="muted">最后更新：${escapeHtml(updated)}</p></div>` : '<div class="content"><h1>从一个真实岗位开始</h1><p class="muted">回到 Agent，把 JD 或岗位链接交给它。益职会在这里持续保存同一个机会。</p></div>'}</main><aside class="rail right"><h2>下一步</h2>${active ? `<div class="next-card"><small>当前行动</small><strong>${escapeHtml(active.next_action || "确认当前最急的问题")}</strong><p>回到 Agent 直接说“继续这个岗位”，它会读取当前状态接着做。</p></div><div class="privacy"><strong>数据只在本机</strong><p>这张作战盘由 Plugin 在 Agent 沙箱中运行，不会自动上传简历或面试记录。</p></div>` : '<p>创建机会后，这里会显示最值得做的一件事。</p>'}</aside></div></body></html>`;
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
      return response(message.id, {
        protocolVersion: message.params?.protocolVersion || "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "yi-zhi", version: "0.3.0" },
        instructions: "Use these private local tools to maintain a job seeker's 益职 cockpit. The connected person is the job seeker, never the owner of the 益职 product."
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

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let dispatchQueue = Promise.resolve();
await startCockpitServer();
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
