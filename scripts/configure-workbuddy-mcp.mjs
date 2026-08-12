#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [configPath, serverPath, nodeCommand = "node"] = process.argv.slice(2);
if (!configPath || !serverPath) {
  process.stderr.write("Usage: configure-workbuddy-mcp.mjs <config-path> <server-path> [node-command]\n");
  process.exit(2);
}

let config = { mcpServers: {} };
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("WorkBuddy MCP configuration must be a JSON object.");
if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) config.mcpServers = {};

config.mcpServers["yi-zhi"] = {
  type: "stdio",
  command: nodeCommand,
  args: [serverPath],
  description: "益职本地求职作战台"
};

await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
