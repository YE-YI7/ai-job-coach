// Synthetic authenticated capacity regression. Never reads customer records.
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const base = process.env.AUDIT_BASE || 'https://www.ai-job-coach.xin';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userId = randomUUID();
const payload = Buffer.from(JSON.stringify({ userId, version: 2, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
const cookie = 'sb-access-token=' + payload + '.' + createHmac('sha256', process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
const report = { at: new Date().toISOString(), base, synthetic: true, checks: [], cleanup: false };
async function api(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { cookie, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const text = await r.text();
  const events = r.headers.get('content-type')?.includes('ndjson') ? text.trim().split('\n').map(x => JSON.parse(x)) : [JSON.parse(text)];
  return { status: r.status, events, data: events.at(-1) };
}
try {
  const user = await db.from('users').insert({ id: userId, email: `chat-budget-${userId}@example.invalid` });
  if (user.error) throw user.error;
  const saved = await api('/api/coach/opportunities', { opportunity: { company: '虚构验收公司', role: 'Agent 产品经理', stage: 'applied', resumeText: '虚构测试：做过客服平台需求分析，没有做过 multi-agent workflow。', jdText: '负责 Agent 工作流产品设计，理解任务拆分、角色分配与失败恢复。', requirements: [], activities: [] } });
  if (!saved.data.opportunity?.id) throw Error('Synthetic workspace creation failed');
  const opportunityId = saved.data.opportunity.id;
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: randomUUID(), user_id: userId, opportunity_id: opportunityId, entity_type: 'project', entity_key: `synthetic-${i}`, claim_type: 'experience', value: `synthetic-${i}`, display_text: `虚构验收历史项目${i}：` + '负责财务报表、流程访谈、需求分析和历史数据核对。'.repeat(12), status: 'confirmed', verification_level: 'user_confirmed', visibility: 'recruiter_safe', source_kind: 'user_statement' }));
  const facts = await db.from('coach_claims').insert(rows);
  if (facts.error) throw facts.error;
  const session = await api('/api/coach/agent/sessions', { opportunityId, title: '验收：百条已确认事实仍可辅导' });
  const started = performance.now();
  const result = await api('/api/coach/agent', { opportunityId, sessionId: session.data.session.id, modelMode: 'fast', requestId: randomUUID(), message: '我没做过 multi-agent workflow，教我从任务拆分开始，用一个小例子，再给我一道练习。不要把例子说成我的经历。' });
  report.ms = Math.round(performance.now() - started);
  report.status = result.status;
  report.reply = result.data.answer || null;
  report.errorCopy = result.data.error || null;
  report.model = result.data.learning_trace?.model;
  report.modelCalls = result.data.learning_trace?.modelCalls;
  const after = await db.from('coach_claims').select('id,display_text,status').eq('user_id', userId).in('id', rows.map(r => r.id));
  report.checks.push({ name: '100 archived facts unchanged', pass: !after.error && after.data?.length === 100 && rows.every(r => after.data.some(a => a.id === r.id && a.display_text === r.display_text && a.status === r.status)) });
  if (process.env.AUDIT_EXPECT_FAILURE === '1') {
    report.checks.push({ name: 'baseline reproduces capacity failure', pass: /装不进 .* token 预算/.test(report.errorCopy || '') });
  } else {
    report.checks.push({ name: 'real model tutoring succeeds', pass: result.status === 200 && result.data.ok === true && Boolean(report.reply) && report.modelCalls >= 1 });
    report.checks.push({ name: 'no internal budget dump', pass: !/confirmed_fact|关键内容装不进/.test(JSON.stringify(result.events)) });
    report.checks.push({ name: 'teaches the requested topic', pass: /任务|拆分/.test(report.reply || '') && /练习|试试|现在|你来/.test(report.reply || '') });
    const turns = await db.from('coach_agent_turns').select('answer').eq('user_id', userId).eq('session_id', session.data.session.id);
    report.checks.push({ name: 'reply persisted', pass: !turns.error && turns.data?.some(t => t.answer === report.reply) });
  }
} catch (e) { report.error = e.message; process.exitCode = 1; }
finally {
  const deleted = await db.from('users').delete().eq('id', userId);
  report.cleanup = !deleted.error;
  const output = process.env.AUDIT_OUTPUT || '/tmp/yizhi-chat-budget-acceptance.json';
  writeFileSync(output, JSON.stringify(report, null, 2));
  const passed = !report.error && report.cleanup && report.checks.every(c => c.pass);
  if (!passed) process.exitCode = 1;
  console.log(JSON.stringify({ passed, output, ms: report.ms, status: report.status, model: report.model, checks: report.checks, cleanup: report.cleanup, error: report.error }));
}
