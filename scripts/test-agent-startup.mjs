import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const server = join(root, '.agents/plugins/plugins/yi-zhi/mcp/server.mjs');
const release = JSON.parse(await readFile(join(root, '.agents/plugins/plugins/yi-zhi/release.json'), 'utf8'));

async function fixture(t, { disabled = false, blocked = false, invalidStorage = false } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'yi-zhi-startup-'));
  const data = join(temp, 'data');
  if (invalidStorage) await writeFile(data, 'sentinel');
  const args = [];
  if (blocked) {
    const hook = join(temp, 'block-loopback.mjs');
    await writeFile(hook, `import {Server} from 'node:net'; Server.prototype.listen = function(){process.nextTick(()=>this.emit('error',Object.assign(new Error('fixture blocked'),{code:'EPERM'})));return this;};`);
    args.push('--import', hook);
  }
  const child = spawn(process.execPath, [...args, server], {
    env: { ...process.env, YI_ZHI_DATA_DIR: data, YI_ZHI_COCKPIT_DISABLED: disabled ? '1' : '0', YI_ZHI_UPDATE_MANIFEST_URL: `data:application/json,${encodeURIComponent(JSON.stringify(release))}` },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const waiting = new Map();
  let nextId = 0;
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    waiting.get(message.id)?.resolve(message);
    waiting.delete(message.id);
  });
  child.on('exit', () => { for (const pending of waiting.values()) pending.reject(Error(`MCP exited: ${stderr}`)); waiting.clear(); });
  t.after(async () => { child.kill(); lines.close(); await rm(temp, { recursive: true, force: true }); });
  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(Error(`MCP timeout: ${method}`)); }, 5000);
      waiting.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  const call = (name, args = {}) => send('tools/call', { name, arguments: args });
  return { send, call, data, stderr: () => stderr };
}

test('real MCP diagnosis and real localhost response, without claiming browser opening', async (t) => {
  const f = await fixture(t);
  const initialized = await f.send('initialize');
  assert.equal(initialized.result.serverInfo.version, release.version);
  assert.match(initialized.result.instructions, /Before starting the workflow, call yi_zhi_diagnose/);
  const listed = await f.send('tools/list');
  const result = await f.call('yi_zhi_diagnose');
  const d = result.result.structuredContent.diagnosis;
  assert.equal(d.mode, 'mcp-cockpit');
  assert.equal(d.tool_count, listed.result.tools.length);
  assert.equal(d.knowledge_available, true);
  assert.equal(d.storage.writable, true);
  assert.equal(d.browser_open, 'not_verified');
  assert.equal((await readdir(f.data)).some((name) => name.startsWith('.diagnostic-')), false);
  const created = await f.call('yi_zhi_create_case', { role: '合成 QA', next_action: '读 JD' });
  assert.equal((await fetch(created.result.structuredContent.cockpit_url)).status, 200);
});

for (const settings of [{ blocked: true, code: 'EPERM' }, { disabled: true, code: 'DISABLED_BY_USER' }]) {
  test(`loopback ${settings.code}: tools survive, no fake URL, saved case round trips`, async (t) => {
    const f = await fixture(t, settings);
    assert.ok((await f.send('initialize')).result);
    const d = (await f.call('yi_zhi_diagnose')).result.structuredContent.diagnosis;
    assert.equal(d.mode, 'mcp-headless');
    assert.equal(d.cockpit.available, false);
    assert.equal(d.cockpit.code, settings.code);
    const created = await f.call('yi_zhi_create_case', { role: '合成 QA' });
    assert.equal(created.result.isError, false);
    assert.equal(created.result.structuredContent.cockpit_available, false);
    assert.equal(created.result.structuredContent.cockpit_url, undefined);
    assert.equal(created.result.content.some((item) => item.type === 'resource_link'), false);
    const loaded = await f.call('yi_zhi_get_cockpit_url');
    assert.equal(loaded.result.structuredContent.case.id, created.result.structuredContent.case.id);
    const state = JSON.parse(await readFile(join(f.data, 'cockpit.json'), 'utf8'));
    assert.ok(state.cases[created.result.structuredContent.case.id]);
  });
}

test('unwritable data target is diagnosed without touching existing contents', async (t) => {
  const f = await fixture(t, { disabled: true, invalidStorage: true });
  assert.ok((await f.send('initialize')).result, 'optional cache failure must not break initialization');
  const d = (await f.call('yi_zhi_diagnose')).result.structuredContent.diagnosis;
  assert.equal(d.mode, 'skills-only');
  assert.equal(d.storage.writable, false);
  assert.equal(await readFile(f.data, 'utf8'), 'sentinel');
  assert.equal((await f.call('yi_zhi_create_case', { role: 'QA' })).result.isError, true);
});
