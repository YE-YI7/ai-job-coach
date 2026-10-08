// Isolated synthetic browser fixture. Credentials remain in process memory.
// Run with a private env file; never use an existing customer's account.
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const statePath = process.env.AUDIT_STATE;
if (!statePath?.startsWith('/tmp/')) throw Error('AUDIT_STATE must be an explicit /tmp fixture path');
const base = process.env.AUDIT_BASE || 'https://www.ai-job-coach.xin';
const browserSession = 'persona-20261008';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = (...args) => {
  try { return execFileSync('agent-browser', ['--session', browserSession, ...args], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Error('Isolated browser action failed: ' + args[0]); }
};
if (process.argv[2] === 'cleanup') {
  const { userId } = JSON.parse(readFileSync(statePath, 'utf8'));
  browser('cookies', 'clear');
  // Mark synthetic telemetry before cascading account cleanup.
  const events = await db.from('product_events').select('id,properties').eq('user_id', userId);
  if (events.error) throw events.error;
  for (const row of events.data || []) {
    const updated = await db.from('product_events').update({ properties: { ...row.properties, is_test: true, test_run: 'persona-20261008' } }).eq('id', row.id).eq('user_id', userId);
    if (updated.error) throw updated.error;
  }
  const deleted = await db.from('users').delete().eq('id', userId).like('email', 'persona-%@example.invalid');
  if (deleted.error) throw deleted.error;
  const remaining = await db.from('users').select('id').eq('id', userId);
  if (remaining.error || remaining.data?.length) throw Error('Synthetic cleanup not confirmed');
  console.log(JSON.stringify({ cleanup: true, markedEvents: events.data?.length || 0 }));
} else {
  const reauth = process.argv[2] === 'reauth';
  const userId = reauth ? JSON.parse(readFileSync(statePath, 'utf8')).userId : randomUUID();
  if (reauth) {
    const existing = await db.from('users').select('id').eq('id', userId).like('email', 'persona-%@example.invalid').single();
    if (existing.error || !existing.data) throw Error('Synthetic fixture identity not confirmed');
  } else {
  writeFileSync(statePath, JSON.stringify({ userId, synthetic: true, createdAt: new Date().toISOString() }), { mode: 0o600 });
  const created = await db.from('users').insert({ id: userId, email: `persona-${userId}@example.invalid` });
  if (created.error) throw created.error;
  const quota = await db.from('user_quotas').upsert({ user_id: userId, free_chat_daily: 3, last_free_reset: new Date().toISOString().slice(0, 10) }, { onConflict: 'user_id' });
  if (quota.error) throw quota.error;
  }
  const payload = Buffer.from(JSON.stringify({ userId, version: 2, exp: Math.floor(Date.now() / 1000) + 1200 })).toString('base64url');
  const token = payload + '.' + createHmac('sha256', process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
  browser('cookies', 'set', 'sb-access-token', token, '--url', base, '--httpOnly');
  console.log(JSON.stringify({ ready: true, userId, browserSession, synthetic: true, expiresInSeconds: 1200 }));
}
