// Exercises the real local routes with an explicitly scoped owner. Never logs credentials.
import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
const scope=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(scope||''))throw Error('Explicit opportunity scope required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data:owner,error}=await db.from('coach_opportunities').select('user_id').eq('id',scope).single();
if(error)throw Error('Owner lookup failed');
const payload=Buffer.from(JSON.stringify({userId:owner.user_id,version:2,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const cookie='sb-access-token='+payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function request(method,body){const r=await fetch('http://localhost:3000/api/coach/agent/sessions',{method,headers:{cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};}
let id;
try{
 const created=await request('POST',{title:'系统验收：可编辑笔记（临时）'});if(!created.body.ok)throw Error('Create failed: '+created.status);id=created.body.session.id;
 const saved=await request('PATCH',{sessionId:id,summary:'关键收获：先定义评测集，再比较召回结果。',expectedSummary:null});if(!saved.body.ok)throw Error('Save failed: '+saved.status);
 const read=await request('GET');if(!read.body.sessions.some(s=>s.id===id&&s.summary===saved.body.summary))throw Error('Readback mismatch');
 const conflict=await request('PATCH',{sessionId:id,summary:'过期草稿',expectedSummary:null});if(conflict.status!==409)throw Error('Conflict not rejected');
 console.log('PASS: real authenticated create, manual note save/readback, stale-edit rejection. No model call.');
}finally{if(id){const {error}=await db.from('coach_learning_sessions').delete().eq('id',id).eq('user_id',owner.user_id);if(error)throw Error('Test cleanup failed');console.log('Only this temporary test session removed.');}}
