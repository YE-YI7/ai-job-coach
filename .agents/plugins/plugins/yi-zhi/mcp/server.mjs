#!/usr/bin/env node

import { createInterface } from "node:readline";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.YI_ZHI_DATA_DIR || join(homedir(), ".yi-zhi");
const STATE_FILE = join(DATA_DIR, "cockpit.json");
const ARTIFACT_DIR = join(DATA_DIR, "artifacts");
const MAX_TEXT = 200_000;

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
    description: "Load the active private local 益职 job-search cockpit, or a specific case, so the user can continue across conversations.",
    inputSchema: {
      type: "object",
      properties: { case_id: { type: "string", description: "Optional case ID; defaults to the active case." } },
      additionalProperties: false
    },
    annotations: { title: "Open 益职 cockpit", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
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

function result(text, data) {
  return { content: [{ type: "text", text }], structuredContent: data, isError: false };
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
    return result(cockpitText(item), { case: item });
  }

  const requestedId = args.case_id ? safeId(args.case_id) : state.active_case_id;
  if (!requestedId || !state.cases[requestedId]) throw new Error("No matching 益职 case. Create one first.");
  const item = state.cases[requestedId];

  if (name === "yi_zhi_get_cockpit") return result(cockpitText(item), { case: item });

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
    return result(cockpitText(item), { case: item });
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
    return result(`已保存益职产物：${title}\n本地路径：${filePath}`, { artifact, case: item });
  }

  throw new Error(`Unknown tool: ${name}`);
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
        serverInfo: { name: "yi-zhi", version: "0.2.0" },
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
