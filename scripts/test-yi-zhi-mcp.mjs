#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const serverPath = new URL("../.agents/plugins/plugins/yi-zhi/mcp/server.mjs", import.meta.url);
const dataDir = await mkdtemp(join(tmpdir(), "yi-zhi-mcp-test-"));
const child = spawn(process.execPath, [serverPath.pathname], {
  env: { ...process.env, YI_ZHI_DATA_DIR: dataDir },
  stdio: ["pipe", "pipe", "inherit"]
});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const waiting = [];
lines.on("line", (line) => waiting.shift()?.resolve(JSON.parse(line)));

function send(message) {
  return new Promise((resolve, reject) => {
    waiting.push({ resolve, reject });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

try {
  const initialized = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(initialized.result.serverInfo.name, "yi-zhi");

  const listed = await send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "yi_zhi_retrieve_knowledge",
    "yi_zhi_create_case",
    "yi_zhi_plan_today",
    "yi_zhi_get_cockpit",
    "yi_zhi_get_cockpit_url",
    "yi_zhi_update_cockpit",
    "yi_zhi_save_artifact"
  ]);

  const knowledge = await send({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "yi_zhi_retrieve_knowledge", arguments: { query: "AI 产品经理 面试", role: "AI 产品经理", limit: 3 } }
  });
  assert.equal(knowledge.result.isError, false);
  assert.equal(knowledge.result.structuredContent.items.length, 3);

  const created = await send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "yi_zhi_create_case", arguments: { company: "示例公司", role: "产品经理", stage: "岗位判断", next_action: "发送 JD" } }
  });
  const caseId = created.result.structuredContent.case.id;
  assert.match(caseId, /^case-/);
  assert.match(created.result.structuredContent.cockpit_url, /^http:\/\/127\.0\.0\.1:\d+\/\?case=case-/);
  assert.equal(created.result.content.some((item) => item.type === "resource_link"), true);

  const updated = await send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "yi_zhi_update_cockpit", arguments: { case_id: caseId, materials: ["JD", "简历"], next_action: "生成岗位决策卡" } }
  });
  assert.deepEqual(updated.result.structuredContent.case.materials, ["JD", "简历"]);

  const saved = await send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "yi_zhi_save_artifact", arguments: { case_id: caseId, type: "job-fit", title: "示例岗位决策卡", content: "投递决策：优先投递" } }
  });
  const artifactPath = saved.result.structuredContent.artifact.path;
  assert.match(await readFile(artifactPath, "utf8"), /优先投递/);

  const reopened = await send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "yi_zhi_get_cockpit", arguments: {} } });
  assert.equal(reopened.result.structuredContent.case.id, caseId);
  assert.equal(reopened.result.structuredContent.case.artifacts.length, 1);

  const browserLink = await send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "yi_zhi_get_cockpit_url", arguments: { case_id: caseId } } });
  const pageResponse = await fetch(browserLink.result.structuredContent.cockpit_url);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /示例公司/);

  process.stdout.write("益职 MCP 闭环测试通过\n");
} finally {
  child.stdin.end();
  child.kill();
}

// Regression: an active Codex conversation keeps working while the Plugin
// cache swaps from one version directory to the next.
const cacheRoot = await mkdtemp(join(tmpdir(), "yi-zhi-plugin-cache-test-"));
const oldRoot = join(cacheRoot, ".codex", "plugins", "cache", "yi-zhi", "yi-zhi", "0.5.0+codex.old");
const newRoot = join(cacheRoot, ".codex", "plugins", "cache", "yi-zhi", "yi-zhi", "0.5.0+codex.new");
const sourceKnowledge = new URL("../.agents/plugins/plugins/yi-zhi/knowledge/knowledge-documents.json", import.meta.url);
await mkdir(join(oldRoot, "mcp"), { recursive: true });
await mkdir(join(oldRoot, "knowledge"), { recursive: true });
await mkdir(join(newRoot, "knowledge"), { recursive: true });
await cp(serverPath, join(oldRoot, "mcp", "server.mjs"));
await cp(sourceKnowledge, join(oldRoot, "knowledge", "knowledge-documents.json"));
await cp(sourceKnowledge, join(newRoot, "knowledge", "knowledge-documents.json"));

const upgradeDataDir = await mkdtemp(join(tmpdir(), "yi-zhi-mcp-upgrade-test-"));
const upgradeChild = spawn(process.execPath, [join(oldRoot, "mcp", "server.mjs")], {
  env: { ...process.env, YI_ZHI_DATA_DIR: upgradeDataDir },
  stdio: ["pipe", "pipe", "inherit"]
});
const upgradeLines = createInterface({ input: upgradeChild.stdout, crlfDelay: Infinity });
const upgradeWaiting = [];
upgradeLines.on("line", (line) => upgradeWaiting.shift()?.resolve(JSON.parse(line)));
function sendUpgrade(message) {
  return new Promise((resolve) => {
    upgradeWaiting.push({ resolve });
    upgradeChild.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

try {
  await sendUpgrade({ jsonrpc: "2.0", id: 20, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  await rm(oldRoot, { recursive: true, force: true });
  const afterUpgrade = await sendUpgrade({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "yi_zhi_retrieve_knowledge", arguments: { query: "产品经理 面试", role: "产品经理", limit: 1 } }
  });
  assert.equal(afterUpgrade.result.isError, false);
  assert.equal(afterUpgrade.result.structuredContent.items.length, 1);
  process.stdout.write("益职 MCP 升级连续性测试通过\n");
} finally {
  upgradeChild.stdin.end();
  upgradeChild.kill();
  await rm(cacheRoot, { recursive: true, force: true });
  await rm(upgradeDataDir, { recursive: true, force: true });
}
