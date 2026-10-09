import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
async function setup(t) {
  const temp = await mkdtemp(join(tmpdir(), 'yi-zhi-installer-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const archive = join(temp, 'release.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', root, '.agents/plugins/plugins/yi-zhi']);
  assert.equal(packed.status, 0);
  const bin = join(temp, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  const env = { ...process.env, CODEX_HOME: join(temp, 'codex'), YI_ZHI_HOME: join(temp, 'yi-zhi'), YI_ZHI_ARCHIVE_URL: `file://${archive}`, YI_ZHI_SKILLS_ONLY: '0' };
  const run = (extra = {}) => spawnSync('sh', [join(root, 'scripts/install-agent.sh'), 'codex'], { env: { ...env, ...extra }, encoding: 'utf8' });
  return { temp, bin, env, run };
}

test('unsupported Node aborts before any installation', async (t) => {
  const f = await setup(t);
  const result = f.run({ PATH: `${f.bin}:${process.env.PATH}` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node.js 18\+/);
  await assert.rejects(access(f.env.CODEX_HOME));
  await assert.rejects(access(f.env.YI_ZHI_HOME));
});

test('explicit skills-only needs no working Node and does not claim MCP registration', async (t) => {
  const f = await setup(t);
  const result = f.run({ PATH: `${f.bin}:${process.env.PATH}`, YI_ZHI_SKILLS_ONLY: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /仅 Skills 已安装/);
  assert.equal((await readdir(join(f.env.CODEX_HOME, 'skills'))).length, 5);
  await assert.rejects(access(f.env.YI_ZHI_HOME));
});

test('full installation copies actual release and preserves prior skills as backup', async (t) => {
  const f = await setup(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /尚未证明 MCP 注册/);
  const installed = JSON.parse(await readFile(join(f.env.YI_ZHI_HOME, 'release.json'), 'utf8'));
  const source = JSON.parse(await readFile(join(root, '.agents/plugins/plugins/yi-zhi/release.json'), 'utf8'));
  assert.equal(installed.version, source.version);
  assert.equal(await readFile(join(f.env.YI_ZHI_HOME, 'mcp/server.mjs'), 'utf8'), await readFile(join(root, '.agents/plugins/plugins/yi-zhi/mcp/server.mjs'), 'utf8'));
  const second = f.run();
  assert.equal(second.status, 0, second.stderr);
  const entries = await readdir(join(f.env.CODEX_HOME, 'skills'));
  assert.equal(entries.filter((name) => name.includes('.backup.')).length, 5);
});
