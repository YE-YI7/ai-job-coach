/* Offline acceptance replay. All accounts/content below are fictional.
 * node scripts/audit-analytics-business.cjs [--serve]
 * This never reads .env, authenticates, or contacts a production service.
 * A non-zero result means the candidate is NOT release-ready.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let fakeRows = {}, selectedRows = [], reads = [], limitSeen;
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => {
    if (name === 'server-only') return {};
    if (name === './admin-analytics-store') return {
      readAnalyticsRows: async (_db, table) => fakeRows[table] || [],
    };
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
    throw Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const logic = load('lib/admin-analytics-business.ts');
const store = load('lib/admin-analytics-business-store.ts');
const fixtureId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = new Date('2026-10-22T10:00:00Z');
const window = logic.businessWindow('2026-10-22', '2026-10-22', now);
const account = (id, createdAt = '2026-10-01T01:00:00Z') => ({ id, createdAt, provider: 'phone' });
const event = (id, user, name, at = '2026-10-22T01:00:00Z', requestId = 'request-fixture') => ({
  id, user_id: user, event_identity: user, event_name: name, created_at: at, request_id: requestId,
});
const checks = [];
function check(name, actual, expected) {
  checks.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
}
const db = { from(table) {
  reads.push(table);
  const query = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'order']) query[method] = () => query;
  query.limit = (limit) => { limitSeen = limit; return Promise.resolve({ data: selectedRows.slice(0, limit), error: null }); };
  return query;
} };
async function main() {
  const range = logic.businessWindow('2026-10-20', '2026-10-22', now);
  check('range_registration_is_new_not_unknown', logic.businessUsers([account(fixtureId, '2026-10-21T01:00:00Z')], [], range)[0]?.age, 'new');
  check('utc_equivalent_midnight_included', logic.businessDaily([account(fixtureId)], [event('boundary', fixtureId, 'page_viewed', '2026-10-21T16:00:00+00:00')], window).rows[0].activeUsers, 1);
  check('duplicate_request_is_one_completed_round', logic.businessDaily([account(fixtureId)], [event('one', fixtureId, 'coach_response_received'), event('two', fixtureId, 'coach_response_received', '2026-10-22T01:00:01Z')], window).rows[0].completedRounds, 1);
  fakeRows = {
    users: [fixtureId, secondId].map(id => ({ id, created_at: '2026-10-01T01:00:00Z', provider: 'phone' })),
    product_events: [event('feature', fixtureId, 'resume_revision_clicked'), event('page', secondId, 'page_viewed')],
  };
  const dataset = await store.readBusinessDataset(db, '2026-10-22', '2026-10-22', 'resume_revision_clicked');
  check('feature_filter_restricts_user_set', dataset.users.rows.map(r => r.id), [fixtureId]);
  check('feature_filter_restricts_active_drilldown', dataset.rows[0].activeUsers, 1);
  selectedRows = [{ id: 'turn-fixture', user_id: fixtureId, created_at: '2026-10-22T01:00:00Z', session_id: 'session-fixture', request_id: 'request-fixture', question: 'Bearer fixture-not-a-real-token-123456', answer: '**仅为虚构验收回复**' }];
  reads = [];
  const sessions = await store.readBusinessSessions(db, fixtureId, '2026-10-22', '2026-10-22');
  check('credential_like_text_redacted', sessions.sessions[0].turns.find(t => t.role === 'user').text.includes('fixture-not-a-real-token-123456'), false);
  check('question_precedes_its_answer', sessions.sessions[0].turns.map(t => t.role), ['user', 'mentor']);
  selectedRows = Array.from({ length: 201 }, (_, i) => ({ ...selectedRows[0], id: `turn-${i}`, request_id: `request-${i}` }));
  const capped = await store.readBusinessSessions(db, fixtureId, '2026-10-22', '2026-10-22');
  check('session_limit_is_explicit_or_paginated', Boolean(capped.nextOffset || capped.truncated || capped.coverage?.truncated), true);
  const before = reads.length;
  const previous = process.env.ANALYTICS_INTERNAL_USER_IDS;
  process.env.ANALYTICS_INTERNAL_USER_IDS = fixtureId;
  const excluded = await store.readBusinessSessions(db, fixtureId.toUpperCase(), '2026-10-22', '2026-10-22');
  if (previous === undefined) delete process.env.ANALYTICS_INTERNAL_USER_IDS;
  else process.env.ANALYTICS_INTERNAL_USER_IDS = previous;
  check('uppercase_excluded_user_denied_before_read', [excluded, reads.length === before], [null, true]);
  console.log(JSON.stringify({ fixtureOnly: true, generatedAt: new Date().toISOString(), checks, observedSessionLimit: limitSeen }, null, 2));
  if (!process.argv.includes('--serve')) { process.exitCode = checks.some(c => !c.pass) ? 1 : 0; return; }
  // Render the exact candidate component with synthetic responses on loopback.
  const componentFile = path.join(root, 'app/admin/evals/analytics/BusinessWorkspace.tsx');
  const source = fs.readFileSync(componentFile, 'utf8');
  const component = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const styleSource = fs.readFileSync(path.join(root, 'app/admin/evals/analytics/Analytics.module.css'), 'utf8');
  const css = styleSource;
  const classes = Object.fromEntries([...styleSource.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => [m[1], m[1]]));
  const browserCode = `const modules={exports:{}};function require(n){if(n==='react')return React;if(n==='react/jsx-runtime')return {jsx:React.createElement,jsxs:React.createElement};if(n==='next/link')return {default:p=>React.createElement('a',{href:p.href},p.children),__esModule:true};if(n.endsWith('.css'))return {default:${JSON.stringify(classes)},__esModule:true};throw Error(n);} (function(module,exports){${component}\n})(modules,modules.exports);ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(modules.exports.default));`;
  // TS JSX automatic-runtime calls have (type, props, key), unlike createElement.
  const browserFixed = browserCode.replace('jsx:React.createElement,jsxs:React.createElement', 'jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k})');
  http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://127.0.0.1:3419');
    if (url.pathname === '/react.js' || url.pathname === '/react-dom.js') {
      res.setHeader('Content-Type', 'text/javascript');
      const file = url.pathname === '/react.js' ? 'react/umd/react.development.js' : 'react-dom/umd/react-dom.development.js';
      return res.end(fs.readFileSync(path.join(root, 'node_modules', file)));
    }
    if (url.pathname === '/ui.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(browserFixed); }
    if (url.pathname.startsWith('/eval-lab/')) {
      const file = path.join(root, 'public', url.pathname);
      if (fs.existsSync(file)) return res.end(fs.readFileSync(file));
      res.statusCode = 404; return res.end();
    }
    if (url.pathname === '/api/admin/analytics') {
      res.setHeader('Content-Type', 'application/json');
      if (url.searchParams.get('feature') === 'error') { res.statusCode = 503; return res.end(JSON.stringify({ error: '虚构读取失败' })); }
      if (url.searchParams.get('view') === 'sessions') return res.end(JSON.stringify({ sessions: { sessions: [{ id: 'session-fixture', turns: [{ id: 'message-fixture', role: 'mentor', status: 'replied', text: '**这是结构化回复**\n\n- 第一条\n- 第二条', createdAt: '2026-10-22T01:00:00Z' }] }], unlinked: null, trace: '未捕获 Eval' } }));
      return res.end(JSON.stringify({ dataset: { ...dataset, users: { rows: Array.from({ length: 20 }, (_, i) => ({ id: i === 0 ? fixtureId : `fictional-user-${i}`, age: 'old', provider: 'phone', activeEvents: 2, lastEventAt: '2026-10-22T01:00:00Z' })), total: 25, nextOffset: 20 } } }));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grok 数据后台 · 纯虚构验收</title><style>body{margin:0}${css}</style><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/ui.js"></script></html>`);
  }).listen(3419, '127.0.0.1', () => console.log('Fictional UI fixture: http://127.0.0.1:3419/?view=users'));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
