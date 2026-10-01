// Production acceptance with two synthetic personas. Never reads customer records.
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const base=process.env.AUDIT_BASE||'https://www.ai-job-coach.xin';
const output=process.env.AUDIT_OUTPUT||'/tmp/yizhi-job-personalization-20261001.json';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(20000)})}});
const personas=[
 {id:randomUUID(),name:'agent-platform',resume:'虚构验收材料\n本科，8年产品经理经验。\n项目：负责Agent产品的任务拆解、服务选择、失败恢复与质量评估；主导企业内部工作台需求访谈和验证。'},
 {id:randomUUID(),name:'ecommerce-transition',resume:'虚构验收材料\n本科，8年产品经理经验。\n项目：负责电商会员、复购、库存与商家经营，主导促销规则和转化分析。没有做过Agent产品，只在聊天助手中使用过这个词，希望转AI产品方向。'},
];
const report={at:new Date().toISOString(),base,synthetic:true,personas:[],checks:[],cleanup:false};
function cookie(id){const p=Buffer.from(JSON.stringify({userId:id,version:2,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');return 'sb-access-token='+p+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(p).digest('base64url');}
async function api(id,path,body){const start=performance.now();const response=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:cookie(id),'content-type':'application/json',...(path==='/api/coach/agent'?{accept:'application/x-ndjson'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const text=await response.text();const data=response.headers.get('content-type')?.includes('ndjson')?JSON.parse(text.trim().split('\n').at(-1)):JSON.parse(text);if(!response.ok||data.ok===false)throw Error(`${path}: ${response.status} ${data.error||'failed'}`);return {data,ms:Math.round(performance.now()-start)};}
try{
 const created=await db.from('users').insert(personas.map(p=>({id:p.id,email:`personalization-${p.id}@example.invalid`})));if(created.error)throw created.error;
 for(const p of personas){
  const saved=await api(p.id,'/api/coach/opportunities',{opportunity:{company:'求职基础档案',role:'AI 产品经理',location:'北京',workspaceType:'preparation',stage:'applied',resumeText:p.resume,requirements:[],activities:[]}});
  const searched=await api(p.id,'/api/coach/jobs/discover',{profileId:saved.data.opportunity.id,requestId:randomUUID()});
  const restored=await api(p.id,'/api/coach/jobs/discover?profileId='+saved.data.opportunity.id);
  const r=searched.data;
  report.personas.push({name:p.name,resume:p.resume,elapsedMs:searched.ms,cacheHit:r.search?.cacheHit,keywords:r.search?.keywords,failedSources:r.failedSources,pending:r.pendingProfileFields,jobs:r.jobs.map(j=>({id:j.id,company:j.company,title:j.title,url:j.url,reasons:j.reasons,requirements:j.jdRequirements})),restored:restored.data.result?.runId===r.runId});
  report.checks.push({name:`${p.name}: bounded shortlist, no padding when coverage insufficient`,pass:r.jobs.length<=5,actual:r.jobs.length});
  report.checks.push({name:`${p.name}: recommendations contain real AI specialty evidence`,pass:r.jobs.every(j=>/\b(?:ai|agent|llm|aigc)\b|人工智能|大模型|智能体|生成式|机器学习/i.test(j.title+'\n'+j.description))});
  report.checks.push({name:`${p.name}: unknown student eligibility is visible`,pass:r.jobs.every(j=> !/在读|在校|大三|大四|currently enrolled|current student/i.test(j.description) || j.reasons.some(x=>x.startsWith('需核实在读')))});
  report.checks.push({name:`${p.name}: persisted result restored`,pass:restored.data.result?.runId===r.runId});
 }
 const [a,b]=report.personas;
 const sameOrder=JSON.stringify(a.jobs.map(j=>j.url))===JSON.stringify(b.jobs.map(j=>j.url));
 const sameReasons=JSON.stringify(a.jobs.map(j=>j.reasons))===JSON.stringify(b.jobs.map(j=>j.reasons));
 report.checks.push({name:'Different project experience affects reasons or explicit gaps (same jobs can be legitimate)',pass:!sameReasons,sameOrder,sameReasons});
 // Complete one actual discovered-job -> mentor branch; other script checks archive/reload.
 const p=personas[1],job=b.jobs.find(j=>/AI|智能|agent/i.test(j.title))||b.jobs[0];
 if(job && process.env.AUDIT_SKIP_MENTOR!=='1'){
  const fresh=await api(p.id,'/api/coach/jobs/discover?profileId='+ (await db.from('coach_opportunities').select('id').eq('user_id',p.id).limit(1).single()).data.id);
  const candidate=fresh.data.result.jobs.find(j=>j.id===job.id);
  const entered=await api(p.id,'/api/coach/opportunities',{opportunity:{company:candidate.company,role:candidate.title,location:candidate.location,workspaceType:'job',stage:'applied',jdText:candidate.description,resumeText:p.resume,requirements:[],activities:[]}});
  const q=await db.from('user_quotas').upsert({user_id:p.id,free_chat_daily:3,last_free_reset:new Date().toISOString().slice(0,10)},{onConflict:'user_id'});if(q.error)throw q.error;
  const s=await api(p.id,'/api/coach/agent/sessions',{opportunityId:entered.data.opportunity.id,title:'验收：真实搜索后辅导'});
  const reply=await api(p.id,'/api/coach/agent',{opportunityId:entered.data.opportunity.id,sessionId:s.data.session.id,modelMode:'fast',requestId:randomUUID(),message:'我有8年电商产品经验，但没做过Agent产品。根据已经给你的简历和这份JD，说明我能迁移的经历、真正缺的能力，并从一个具体练习开始教，不要把没做过的事说成我做过，也不要重新索要简历。'});
  report.mentor={job:job.title,answer:reply.data.answer,elapsedMs:reply.ms,firstTextMs:reply.data.learning_trace?.timing?.firstTextMs,modelCalls:reply.data.learning_trace?.modelCalls,knowledgeIds:reply.data.learning_trace?.knowledgeIds};
 }
 if(process.env.AUDIT_BROWSER==='1'){
  const browser=(...args)=>execFileSync('agent-browser',['--session','yizhi-shortlist-synthetic',...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  try{
   browser('cookies','set','sb-access-token',cookie(p.id).slice('sb-access-token='.length),'--url',base,'--httpOnly');
   browser('set','viewport','1440','900');browser('open',base+'/cockpit');browser('wait','--load','networkidle');
   browser('find','text','我的简历与方向','click');browser('wait','--load','networkidle');
   browser('eval',`Array.from(document.querySelectorAll('summary')).find(x=>x.textContent.includes('为什么推荐'))?.click()`);
   browser('screenshot','/tmp/yizhi-shortlist-fixed-desktop.png');
   browser('set','viewport','390','844');browser('screenshot','/tmp/yizhi-shortlist-fixed-mobile.png');
   const width=JSON.parse(browser('eval','JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth})').trim());
   report.checks.push({name:'authenticated responsive recommendations: no page overflow',pass:width.scroll<=width.width});
   report.browser={desktop:'/tmp/yizhi-shortlist-fixed-desktop.png',mobile:'/tmp/yizhi-shortlist-fixed-mobile.png'};
  }finally{browser('cookies','clear');browser('close');}
 }
}catch(e){report.error=e.message;process.exitCode=1;}
finally{
 const removed=await db.from('users').delete().in('id',personas.map(p=>p.id));report.cleanup=!removed.error;
 if(removed.error){report.cleanupError=removed.error.message;process.exitCode=1;}
 writeFileSync(output,JSON.stringify(report,null,2));
 const passed=!report.error&&report.cleanup&&report.checks.every(check=>check.pass);
 if(!passed)process.exitCode=1;
 console.log(JSON.stringify({passed,output,checks:report.checks,cleanup:report.cleanup,error:report.error,mentor:report.mentor?{elapsedMs:report.mentor.elapsedMs,firstTextMs:report.mentor.firstTextMs}:null}));
}
