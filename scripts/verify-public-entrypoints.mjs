// Anonymous HTTP gate only: no cookies, credentials, model calls or data writes.
// node scripts/verify-public-entrypoints.mjs http://localhost:3341
// node scripts/verify-public-entrypoints.mjs https://yizhioffer.com
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'https://yizhioffer.com');
assert.ok(['http:', 'https:'].includes(base.protocol));
assert.equal(base.username + base.password + base.search + base.hash, '');
assert.equal(base.pathname, '/');
const canonicalBase = 'https://yizhioffer.com';
const pages = [
  ['/', '益职'], ['/agent', '当前沙箱'],
  ['/tools/resume-jd-gap', '对照 JD，不是把关键词塞进简历'],
  ['/tools/offer-compare', 'Offer'],
  ['/guides/resume-without-metrics', '材料里能确认的事实'],
  ['/tools/interview-review', '空模板（不输入也能完整看）'],
];
async function read(path) {
  return fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
}
for (const [path, bodyProof] of pages) {
  const response = await read(path), html = await response.text();
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: one H1 required`);
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  assert.equal(canonical, canonicalBase + (path === '/' ? '' : path), `${path}: canonical`);
  assert.ok(html.includes(bodyProof), `${path}: public server-readable body missing`);
  assert.ok(!/name="robots"[^>]*content="[^"]*noindex/i.test(html), `${path}: noindex`);
  console.log(JSON.stringify({ path, status: response.status, canonical, serverReadable: true }));
}
const sitemap = await read('/sitemap.xml');
assert.equal(sitemap.status, 200);
const locations = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]).sort();
assert.deepEqual(locations, pages.map(([path]) => canonicalBase + (path === '/' ? '' : path)).sort());
for (const path of ['/cockpit', '/admin/evals', '/admin/evals/analytics', '/guides/private-draft']) {
  const response = await read(path);
  assert.ok([302, 303, 307, 308].includes(response.status), `${path}: private route must not be public`);
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/login');
}
const admin = await read('/api/admin/analytics');
assert.equal(admin.status, 401, 'anonymous administrator API must be rejected');
console.log(JSON.stringify({ target: base.origin, publicPages: pages.length, privateGates: 'passed', modelCalls: 0, dataWrites: 0, passed: true }));
