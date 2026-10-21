import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { decideBuild, isDocumentationOnlyPath } from './vercel-ignore-build.mjs';

test('明确文档白名单，不按所有md/json后缀跳构建', () => {
  for (const p of ['docs/product/a.md', 'docs/operations/中文 空格.md', '.impeccable/review/a.png', 'README.md']) assert.equal(isDocumentationOnlyPath(p), true);
  for (const p of ['knowledge-base/knowledge/a.md', 'data/job-knowledge.seed.json', 'lib/x.ts', 'evals/a.json', 'docs/architecture/evals/a.json', 'public/a.png', 'package-lock.json', 'vercel.json', 'scripts/compile-knowledge-base.mjs', 'docs/product/code.ts']) assert.equal(isDocumentationOnlyPath(p), false, p);
});

const current = 'a'.repeat(40), previous = 'b'.repeat(40);
const env = { VERCEL_GIT_COMMIT_SHA: current, VERCEL_GIT_PREVIOUS_SHA: previous };
function mocked(paths, failAt = '') {
  return (args) => {
    if (args[0] === failAt) throw Error('synthetic git error');
    if (args[0] === 'rev-parse') return current + '\n';
    if (args[0] === 'diff') return paths.map(p => p + '\0').join('');
    return '';
  };
}
test('纯文档跳过，任何运行时混合改动继续', () => {
  assert.equal(decideBuild({ env, git: mocked(['docs/operations/a.md', 'DESIGN.md']) }).ignore, true);
  assert.equal(decideBuild({ env, git: mocked(['docs/operations/a.md', 'knowledge-base/a.md']) }).ignore, false);
  assert.equal(decideBuild({ env, git: mocked(['docs/operations/a.md', 'lib/a.ts']) }).ignore, false);
});
test('缺失/畸形SHA、缺历史、分叉、空diff和手工强制都继续构建', () => {
  for (const e of [{}, { ...env, VERCEL_GIT_PREVIOUS_SHA: 'HEAD^' }, { ...env, VERCEL_GIT_COMMIT_SHA: 'x;echo bad' }, { ...env, VERCEL_FORCE_BUILD: '1' }]) assert.equal(decideBuild({ env: e, git: mocked(['README.md']) }).ignore, false);
  for (const fail of ['rev-parse', 'cat-file', 'merge-base', 'diff']) assert.equal(decideBuild({ env, git: mocked(['README.md'], fail) }).ignore, false);
  assert.equal(decideBuild({ env, git: mocked([]) }).ignore, false);
  assert.equal(decideBuild({ env, git: () => 'c'.repeat(40) }).ignore, false);
});

test('真实Git：多提交push、删除、改名与特殊文件名不会漏掉代码', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'yizhi-ignore-test-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (name, text) => { mkdirSync(dirname(join(cwd, name)), { recursive: true }); writeFileSync(join(cwd, name), text); };
  const commit = () => { git('add', '--all'); git('-c', 'user.name=Synthetic QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'synthetic fixture'); return git('rev-parse', 'HEAD'); };
  const decision = (base) => decideBuild({ cwd, env: { VERCEL_GIT_COMMIT_SHA: git('rev-parse', 'HEAD'), VERCEL_GIT_PREVIOUS_SHA: base } });
  try {
    git('init', '-q'); put('README.md', 'base'); const base = commit();
    put('docs/operations/中文\n空 格.md', 'doc'); const docs = commit();
    assert.equal(decision(base).ignore, true);
    put('lib/runtime.ts', 'export const value=1'); commit();
    put('docs/product/latest.md', 'doc last'); commit();
    assert.equal(decision(docs).ignore, false, '不能只检查最后一个文档提交');
    const code = git('rev-parse', 'HEAD');
    git('mv', 'lib/runtime.ts', 'docs/product/moved.md'); commit();
    assert.equal(decision(code).ignore, false, '重命名仍包含原代码删除');
    const renamed = git('rev-parse', 'HEAD');
    git('rm', 'docs/product/moved.md'); commit();
    assert.equal(decision(renamed).ignore, true, '只删除无运行时用途文档可跳过');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('Git专用手工发布分支不生成重复Preview，其他分支保持默认', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.ignoreCommand, 'node scripts/vercel-ignore-build.mjs');
  assert.deepEqual(config.git.deploymentEnabled, { 'codex/production-release': false });
  assert.deepEqual(config.crons, [{ path: '/api/cron/job-market', schedule: '0 1 * * *' }]);
});
