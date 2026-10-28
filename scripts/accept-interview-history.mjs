import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Opt-in synthetic fixtures only. Never use a real user's cookie, quota or answers.
if (process.env.RUN_INTERVIEW_HISTORY_QA !== '1') throw Error('Synthetic fixture opt-in required');
const mode = process.argv[2], origin = process.argv[3] || 'http://localhost:3362';
if (!/^http:\/\/localhost:\d+$/.test(origin) && !/^https:\/\/[\w.-]+\.vercel\.app$/.test(origin)
  && origin !== 'https://yizhioffer.com') throw Error('Unexpected target');
const folder = '.artifacts/interview-history-1028';
const stateFile = `${folder}/private-fixture.json`;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const tableRows = async (table) => {
  const { data, error } = await db.from(table).select('*').limit(1001);
  if (error || data.length >= 1000) throw Error(`Cannot establish complete protected baseline: ${table}`);
  return data;
};
const digest = rows => createHash('sha256').update(JSON.stringify([...rows].sort((a,b)=>String(a.id||a.user_id).localeCompare(String(b.id||b.user_id))))).digest('hex');
async function insert(table, rows) {
  const { error } = await db.from(table).insert(rows);
  if (error) throw Error(`Synthetic ${table} insert failed: ${error.code}`);
}
async function persist(state) { await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); }
if (mode === 'prepare') {
  await mkdir(folder, { recursive: true });
  try { await readFile(stateFile); throw Error('Existing fixture exists; do not duplicate'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const state = { users: [randomUUID(),randomUUID()], jobs: [randomUUID(),randomUUID()], sessions: [], questions: [],
    codes: [`QA-MOCK-${randomUUID()}`, `QA-MOCK-${randomUUID()}`], baseline: {}, createdAt: new Date().toISOString() };
  for (const table of ['interview_answers', 'resumes', 'user_quotas']) {
    const rows = await tableRows(table); state.baseline[table] = { ids: rows.map(row=>row.id||row.user_id), hash: digest(rows) };
  }
  await persist(state);
  for (let index = 0; index < 2; index++) {
    const uid = state.users[index], code = state.codes[index];
    await insert('users', { id: uid, email: `${uid}@example.invalid`, provider: 'invite', nickname: `虚构面试验收${index+1}` });
    await insert('invites', { code, used: true, redeemed_by: uid, max_uses: 1, uses_count: 1 });
    await insert('coach_opportunities', { id: state.jobs[index], user_id: uid, company: '面试记录验收（虚构公司）',
      role: '产品经理（虚构验收）', jd_text: '负责杭州B2B审批产品，关注流程完成率、需求诊断与实验取舍。', stage: 'interview', status: 'active',
      metadata: { interviewFocus: [], actions: [], activities: [], requirements: [], resumeChanges: [],
        resumeText: '陈知远（虚构验收），负责审批产品需求梳理，参与方案验证，不代表真实用户经历。' } });
  }
  const sid = randomUUID(); state.sessions.push(sid);
  const questions = ['请介绍审批流程项目里你亲自负责的判断和动作。', '审批完成率变化如何核对口径？', '如果实验没有提升，你会怎么取舍？']
    .map((question_text,index)=>({ id: randomUUID(),session_id:sid,question_text,
      tips:{intent:'仅用于虚构验收',_harness:{ordinal:index,linkage:{kind:'session_opener'}}},created_at:new Date(Date.now()+index).toISOString() }));
  state.questions.push(...questions.map(question=>question.id)); await persist(state);
  await insert('interview_sessions', { id:sid,user_id:state.users[0],opportunity_id:state.jobs[0],jd:'审批产品，需求诊断、指标归因和实验取舍。',round_type:'业务面',question_count:3 });
  await insert('interview_questions',questions);
  // More than one page, without any real model calls or fabricated assessments.
  for(let index=0;index<11;index++){
    const id=randomUUID(), qid=randomUUID();state.sessions.push(id);state.questions.push(qid);await persist(state);
    await insert('interview_sessions',{id,user_id:state.users[0],opportunity_id:state.jobs[0],jd:'虚构历史分页验收',round_type:'业务面',question_count:1,created_at:new Date(Date.now()-86400000*(index+1)).toISOString()});
    await insert('interview_questions',{id:qid,session_id:id,question_text:`虚构历史问题${index+1}`,tips:{_harness:{ordinal:0}}});
  }
  await persist(state);
  console.log(JSON.stringify({ prepared:true, synthetic:true, folder, accountCount:2, sessionCount:state.sessions.length }));
} else {
  const state = JSON.parse(await readFile(stateFile,'utf8'));
  async function request(index, path, method='GET', body) {
    const uid=state.users[index];
    const payload=Buffer.from(JSON.stringify({version:2,userId:uid,email:`${uid}@example.invalid`,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
    const token=`${payload}.${createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url')}`;
    const res=await fetch(`${origin}${path}`,{method,headers:{Cookie:`sb-access-token=${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
    return {status:res.status,headers:res.headers,data:await res.json()};
  }
  if(mode==='check'){
    const sid=state.sessions[0],qid=state.questions[0],checks=[];
    assert.equal((await request(0,'/api/interview/history','POST',{sessionId:sid,action:'setup',roundLabel:'二面'})).status,200);
    assert.equal((await request(0,'/api/interview/history','POST',{sessionId:sid,action:'seen',questionId:qid})).status,200);
    const original='QA-HISTORY-1028：我先核对审批完成率的分子分母，再比较不同入口的提交断点。';
    assert.equal((await request(0,'/api/interview/draft','POST',{sessionId:sid,questionId:qid,answer:original})).status,200);
    const detail=await request(0,`/api/interview/history?sessionId=${sid}`);
    assert.equal(detail.status,200);assert.equal(detail.data.sessions[0].turns[0].answer,original);
    assert.match(detail.headers.get('cache-control'),/no-store/);checks.push('exact pending answer read back from cloud without model');
    const foreign=await request(1,`/api/interview/history?sessionId=${sid}`);assert.equal(foreign.status,404);
    assert.equal((await request(1,'/api/interview/history','POST',{sessionId:sid,action:'end'})).status,404);
    assert.equal((await request(1,'/api/interview/draft','POST',{sessionId:sid,questionId:qid,answer:'foreign'})).status,404);
    assert.equal((await request(1,`/api/interview/history?q=QA-HISTORY-1028`)).data.total,0);checks.push('second real authenticated identity cannot read, search, end or write first identity session');
    const page1=await request(0,`/api/interview/history?opportunityId=${state.jobs[0]}`),page2=await request(0,`/api/interview/history?opportunityId=${state.jobs[0]}&page=2`);
    assert.equal(page1.data.total,12);assert.equal(page1.data.sessions.length,10);assert.equal(page2.data.sessions.length,2);
    assert(!page1.data.sessions.some(a=>page2.data.sessions.some(b=>a.id===b.id)));checks.push('cloud history pagination 10 plus 2, no overlapping IDs');
    const search=await request(0,`/api/interview/history?q=QA-HISTORY-1028&round=${encodeURIComponent('二面')}`);
    assert.equal(search.status,200);assert.equal(search.data.total,1);assert.equal(search.data.sessions[0].id,sid);checks.push('global owned answer search combined with saved ordinal round');
    const before=await db.from('user_quotas').select('*').in('user_id',state.users);
    state.checks=checks;state.quotaBeforeBrowserHash=digest(before.data||[]);await persist(state);
    await writeFile(`${folder}/api-checks.json`,JSON.stringify({origin,passed:true,synthetic:true,checks},null,2));
    console.log(JSON.stringify({passed:true,checks},null,2));
  } else if(mode==='preserve'||mode==='cleanup'){
    for(const [table,baseline] of Object.entries(state.baseline)){
      const rows=(await tableRows(table)).filter(row=>baseline.ids.includes(row.id||row.user_id));
      assert.equal(digest(rows),baseline.hash,`Protected original rows changed: ${table}`);
    }
    console.log(JSON.stringify({protectedOriginalRowsUnchanged:true,tables:Object.keys(state.baseline)}));
    if(mode==='cleanup'){
      for(let index=0;index<2;index++){
        const invite=await db.from('invites').delete().eq('code',state.codes[index]).eq('redeemed_by',state.users[index]);if(invite.error)throw Error('Synthetic invite cleanup failed');
        const removed=await db.from('users').delete().eq('id',state.users[index]).eq('email',`${state.users[index]}@example.invalid`);if(removed.error)throw Error('Synthetic user cleanup failed');
      }
      state.cleanedAt=new Date().toISOString();await persist(state);
      console.log(JSON.stringify({syntheticFixturesRemoved:true,syntheticInviteCredentialsDeleted:true,
        note:'Browser must separately log out; signed API test tokens expire within fifteen minutes, no production key rotation.'}));
    }
  } else throw Error('Use prepare, check, preserve or cleanup');
}
