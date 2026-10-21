// 只跳过明确的纯文档变更；证据不足时继续构建，不能漏发运行时代码。
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDocumentationOnlyPath(path) {
  return /^(?:docs\/(?:operations|product)\/.+\.md|\.impeccable\/.+\.(?:md|png|jpe?g|webp|pdf|txt)|(?:README|AGENTS|CLAUDE|DESIGN|PRODUCT)\.md)$/s.test(path);
}

export function decideBuild({ env = process.env, cwd = process.cwd(), git } = {}) {
  const run = git || ((args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const build = (reason, paths = []) => ({ ignore: false, reason, paths });
  if (env.VERCEL_FORCE_BUILD === '1') return build('explicit-force');
  const current = env.VERCEL_GIT_COMMIT_SHA;
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  // PREVIOUS_SHA 是该项目/分支上次成功部署，不用 HEAD^ 猜多提交 push 的边界。
  const validSha = (value) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
  if (!validSha(current) || !validSha(previous)) return build('missing-or-invalid-baseline');
  try {
    if (run(['rev-parse', 'HEAD']).trim() !== current) return build('checkout-mismatch');
    run(['cat-file', '-e', `${previous}^{commit}`]);
    run(['merge-base', '--is-ancestor', previous, current]);
    const paths = run(['diff', '--no-renames', '--name-only', '-z', previous, current, '--'])
      .split('\0').filter(Boolean);
    if (!paths.length) return build('empty-diff');
    if (!paths.every(isDocumentationOnlyPath)) return build('runtime-or-unknown-change', paths);
    return { ignore: true, reason: 'documentation-only', paths };
  } catch {
    // 浅克隆缺基准、历史分叉、Git失败等都不能跳过构建。
    return build('git-evidence-unavailable');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = decideBuild();
  console.log(JSON.stringify({ action: result.ignore ? 'skip' : 'build', reason: result.reason, changedFiles: result.paths.length }));
  // Vercel 约定：0 跳过，1 继续；不要按一般“成功=构建”的习惯反转。
  process.exitCode = result.ignore ? 0 : 1;
}
