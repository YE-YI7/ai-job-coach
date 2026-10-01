// Synthetic-account read/search acceptance. Never reads or modifies a customer's records.
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:3021';
assert.ok(['http://localhost:3021','https://www.ai-job-coach.xin'].includes(base));
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),id=randomUUID();
const payload=Buffer.from(JSON.stringify({userId:id,version:2,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const token=payload+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:'sb-access-token='+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const b=await r.json();assert.ok(r.ok,b.error||'Request failed');return b;}
try{
 const u=await db.from('users').insert({id,email:`domestic-acceptance-${id}@example.invalid`});if(u.error)throw u.error;
 const p=await api('/api/coach/opportunities',{opportunity:{company:'求职基础档案',role:'AI 产品经理',location:'深圳',workspaceType:'preparation',stage:'applied',resumeText:'虚构验收样例\n8 年产品经理经验，本科学历，做过 Agent 平台产品。',requirements:[],activities:[]}});
 const result=await api('/api/coach/jobs/discover',{profileId:p.opportunity.id,requestId:randomUUID()});
 assert.ok(result.jobs.length>0,'Domestic live search returned no candidates');
 assert.ok(result.search.sources.every(s=>s.homepage==='https://careers.tencent.com'));
 assert.ok(result.jobs.every(j=>j.company==='腾讯'&&new URL(j.url).hostname==='careers.tencent.com'&&j.location.includes('深圳')));
 const restored=await api('/api/coach/jobs/discover?profileId='+p.opportunity.id);assert.equal(restored.found,true);assert.equal(restored.result.runId,result.runId);
 if(process.env.HARNESS_BROWSER==='1'){
  const browser=(...args)=>execFileSync('agent-browser',['--session','yizhi-cn-acceptance',...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  try{
   browser('cookies','set','sb-access-token',token,'--url',base,'--httpOnly');browser('set','viewport','1440','1000');browser('open',base+'/cockpit');browser('wait','--load','networkidle');
   if(!browser('snapshot','-i').includes('重新查找')){browser('find','text','基础档案 · 多个岗位共用','click');browser('wait','--load','networkidle');}
   for(let i=0;i<20&&!browser('snapshot','-i').includes('看看我适不适合');i++)browser('wait','500');
   browser('eval',"document.querySelector('[class*=discovery]')?.scrollIntoView({block:'start'})");browser('wait','500');
   assert.ok(browser('snapshot','-i').includes('看看我适不适合'));browser('screenshot','/tmp/yizhi-cn-desktop.png');
   browser('set','viewport','390','844');browser('wait','500');browser('eval',"document.querySelector('[class*=discovery]')?.scrollIntoView({block:'start'})");
   const metrics=JSON.parse(JSON.parse(browser('eval','JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth})')));assert.ok(metrics.scroll<=metrics.width,'Mobile overflow');browser('screenshot','/tmp/yizhi-cn-mobile.png');
  }finally{browser('cookies','clear');browser('close');}
 }
 console.log(JSON.stringify({passed:true,candidates:result.jobs.length,sources:result.search.sources.map(s=>s.label),restored:true,modelCalls:0}));
}finally{const cleanup=await db.from('users').delete().eq('id',id);if(cleanup.error)throw cleanup.error;console.log('Synthetic domestic-search account cleaned.');}
