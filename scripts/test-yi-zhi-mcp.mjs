#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
    "yi_zhi_create_case",
    "yi_zhi_get_cockpit",
    "yi_zhi_get_cockpit_url",
    "yi_zhi_update_cockpit",
    "yi_zhi_save_artifact"
  ]);

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
