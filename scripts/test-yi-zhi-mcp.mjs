#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const serverPath = new URL("../.agents/plugins/plugins/yi-zhi/mcp/server.mjs", import.meta.url);
const sourceRelease = new URL("../.agents/plugins/plugins/yi-zhi/release.json", import.meta.url);
const updateManifest = {
  schema_version: 1,
  product: "yi-zhi",
  channel: "stable",
  version: "0.9.0",
  released_at: "2026-09-01T00:00:00Z",
  update_url: "https://ai-job-coach.xin/agent",
  release_notes: "测试版本更新提醒"
};
const updateManifestUrl = `data:application/json,${encodeURIComponent(JSON.stringify(updateManifest))}`;
const dataDir = await mkdtemp(join(tmpdir(), "yi-zhi-mcp-test-"));
const child = spawn(process.execPath, [serverPath.pathname], {
  env: { ...process.env, YI_ZHI_DATA_DIR: dataDir, YI_ZHI_UPDATE_MANIFEST_URL: updateManifestUrl, YI_ZHI_UPDATE_CHECK_MS: "604800000" },
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
  assert.equal(initialized.result.serverInfo.version, "0.8.2");
  assert.match(initialized.result.instructions, /0\.9\.0 is available/);
  assert.match(initialized.result.instructions, /yi_zhi_get_application_context/);

  const listed = await send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "yi_zhi_check_update",
    "yi_zhi_retrieve_knowledge",
    "yi_zhi_tokenpay_connect",
    "yi_zhi_tokenpay_exchange",
    "yi_zhi_tokenpay_balance",
    "yi_zhi_tokenpay_create_payment",
    "yi_zhi_tokenpay_payment_status",
    "yi_zhi_create_case",
    "yi_zhi_plan_today",
    "yi_zhi_get_cockpit",
    "yi_zhi_get_cockpit_url",
    "yi_zhi_update_cockpit",
    "yi_zhi_record_fact",
    "yi_zhi_freeze_snapshot",
    "yi_zhi_get_application_context",
    "yi_zhi_save_artifact"
  ]);

  const checkedUpdate = await send({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "yi_zhi_check_update", arguments: { force: true } }
  });
  assert.equal(checkedUpdate.result.structuredContent.update.current_version, "0.8.2");
  assert.equal(checkedUpdate.result.structuredContent.update.latest_version, "0.9.0");
  assert.equal(checkedUpdate.result.structuredContent.update.update_available, true);
  assert.match(checkedUpdate.result.content[0].text, /0\.8\.2 → 0\.9\.0/);

  const tokenPayConnect = await send({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "yi_zhi_tokenpay_connect", arguments: {} } });
  const tokenPayUrl = new URL(tokenPayConnect.result.structuredContent.authorization_url);
  assert.equal(tokenPayUrl.hostname, "tokendance.space");
  assert.equal(tokenPayUrl.searchParams.get("code_challenge_method"), "S256");
  assert.match(tokenPayUrl.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(tokenPayConnect.result).includes("verifier"), false);

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

  const fact = await send({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "yi_zhi_record_fact", arguments: { case_id: caseId, text: "负责 AI 产品从需求到上线", visibility: "recruiter_safe", confirmed_by_user: true } } });
  const factId = fact.result.structuredContent.fact.id;
  assert.match(factId, /^fact-/);

  const snapshot = await send({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "yi_zhi_freeze_snapshot", arguments: { case_id: caseId, type: "jd", title: "示例 JD", content: "负责 AI 产品需求分析" } } });
  assert.equal(snapshot.result.structuredContent.snapshot.version, 1);

  const applicationContext = await send({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "yi_zhi_get_application_context", arguments: { case_id: caseId } } });
  assert.equal(applicationContext.result.structuredContent.confirmed_facts.length, 1);
  assert.equal(applicationContext.result.structuredContent.snapshots.length, 1);

  const saved = await send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "yi_zhi_save_artifact", arguments: { case_id: caseId, type: "job-fit", title: "示例岗位决策卡", content: "投递决策：优先投递", claim_ids: [factId], quality: { facts: "passed" } } }
  });
  const artifactPath = saved.result.structuredContent.artifact.path;
  assert.match(await readFile(artifactPath, "utf8"), /优先投递/);

  const reopened = await send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "yi_zhi_get_cockpit", arguments: {} } });
  assert.equal(reopened.result.structuredContent.case.id, caseId);
  assert.equal(reopened.result.structuredContent.case.artifacts.length, 1);
  assert.equal(reopened.result.structuredContent.case.artifacts[0].claim_ids[0], factId);

  const browserLink = await send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "yi_zhi_get_cockpit_url", arguments: { case_id: caseId } } });
  const pageResponse = await fetch(browserLink.result.structuredContent.cockpit_url);
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, /示例公司/);
  assert.match(pageHtml, /插件更新/);
  assert.match(pageHtml, /0\.8\.2 → 0\.9\.0/);
  assert.match(pageHtml, /TokenPay/);
  assert.match(pageHtml, /确认事实/);
  assert.match(pageHtml, /岗位版本/);

  const updateState = JSON.parse(await readFile(join(dataDir, "update-state.json"), "utf8"));
  assert.equal(updateState.update_available, true);
  assert.equal(updateState.latest_version, "0.9.0");

  process.stdout.write("益职 MCP 闭环测试通过\n");
} finally {
  child.stdin.end();
  child.kill();
  await rm(dataDir, { recursive: true, force: true });
}

// Regression: an active Codex conversation keeps working while the Plugin
// cache swaps from one version directory to the next.
const cacheRoot = await mkdtemp(join(tmpdir(), "yi-zhi-plugin-cache-test-"));
const oldRoot = join(cacheRoot, ".codex", "plugins", "cache", "yi-zhi", "yi-zhi", "0.5.0+codex.old");
const newRoot = join(cacheRoot, ".codex", "plugins", "cache", "yi-zhi", "yi-zhi", "0.5.0+codex.new");
const sourceKnowledge = new URL("../.agents/plugins/plugins/yi-zhi/knowledge/knowledge-documents.json", import.meta.url);
await mkdir(join(oldRoot, "mcp"), { recursive: true });
await mkdir(join(oldRoot, "knowledge"), { recursive: true });
await cp(serverPath, join(oldRoot, "mcp", "server.mjs"));
await cp(sourceKnowledge, join(oldRoot, "knowledge", "knowledge-documents.json"));
await cp(sourceRelease, join(oldRoot, "release.json"));

const upgradeDataDir = await mkdtemp(join(tmpdir(), "yi-zhi-mcp-upgrade-test-"));
const upgradeChild = spawn(process.execPath, [join(oldRoot, "mcp", "server.mjs")], {
  env: { ...process.env, YI_ZHI_DATA_DIR: upgradeDataDir, YI_ZHI_KNOWLEDGE_REFRESH_MS: "0", YI_ZHI_UPDATE_MANIFEST_URL: updateManifestUrl },
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
  const beforeUpgrade = await sendUpgrade({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "yi_zhi_retrieve_knowledge", arguments: { query: "产品经理 面试", role: "产品经理", limit: 1 } }
  });
  assert.equal(beforeUpgrade.result.isError, false);

  const nextKnowledge = JSON.parse(await readFile(sourceKnowledge, "utf8"));
  nextKnowledge.documents[0].title = "热更新知识标记";
  nextKnowledge.documents[0].roles = ["产品经理"];
  nextKnowledge.documents[0].content = "热更新知识标记 产品经理 面试";
  nextKnowledge.documents = [nextKnowledge.documents[0]];
  await mkdir(join(newRoot, "knowledge"), { recursive: true });
  await writeFile(join(newRoot, "knowledge", "knowledge-documents.json"), JSON.stringify(nextKnowledge));
  await rm(oldRoot, { recursive: true, force: true });
  const afterUpgrade = await sendUpgrade({
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: { name: "yi_zhi_retrieve_knowledge", arguments: { query: "产品经理 面试", role: "产品经理", limit: 1 } }
  });
  assert.equal(afterUpgrade.result.isError, false);
  assert.equal(afterUpgrade.result.structuredContent.items.length, 1);
  assert.equal(afterUpgrade.result.structuredContent.items[0].title, "热更新知识标记");
  process.stdout.write("益职 MCP 升级连续性与知识热更新测试通过\n");
} finally {
  upgradeChild.stdin.end();
  upgradeChild.kill();
  await rm(cacheRoot, { recursive: true, force: true });
  await rm(upgradeDataDir, { recursive: true, force: true });
}
