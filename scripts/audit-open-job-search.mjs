// Authenticated runtime acceptance. Synthetic profiles only; deletes accounts in finally.
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const base=process.env.AUDIT_BASE||'https://www.ai-job-coach.xin';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const personas=[
 {id:randomUUID(),role:'机械工程师',city:'上海',resume:'虚构验收材料。本科，8年机械工程师经验。负责非标自动化设备机械设计、SolidWorks建模、AutoCAD工程图、BOM编制、材料选型与制造工艺；主导样机试制、装配调试、量产转化和降本改善。'},
 {id:randomUUID(),role:'AI 产品经理',city:'北京',resume:'虚构验收材料。本科，8年产品经理经验。负责Agent平台任务拆解、服务选择、失败恢复和质量评估；主导需求访谈与用户体验验证。'},
 {id:randomUUID(),role:'会计',city:'杭州',resume:'虚构验收材料。本科，8年财务会计经验。负责制造企业全盘账务、成本核算、税务申报、财务报表和审计配合；使用金蝶和Excel进行数据核对，主导月度结账和财务质量管控。'},
];
const report={at:new Date().toISOString(),base,synthetic:true,personas:[],checks:[],cleanup:false};
function cookie(id){const p=Buffer.from(JSON.stringify({userId:id,version:2,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');return 'sb-access-token='+p+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(p).digest('base64url');}
async function api(id,path,body){const t=performance.now();const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:cookie(id),'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const b=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${b.error||'failed'}`);return {b,ms:Math.round(performance.now()-t)};}
try{
 const c=await db.from('users').insert(personas.map(p=>({id:p.id,email:`open-search-${p.id}@example.invalid`})));if(c.error)throw c.error;
 for(const p of personas){
  const {b:s}=await api(p.id,'/api/coach/opportunities',{opportunity:{company:'求职基础档案',role:p.role,location:p.city,workspaceType:'preparation',stage:'applied',resumeText:p.resume,requirements:[],activities:[]}});
  const {b:r,ms}=await api(p.id,'/api/coach/jobs/discover',{profileId:s.opportunity.id,requestId:randomUUID()});
  const {b:g}=await api(p.id,'/api/coach/jobs/discover?profileId='+s.opportunity.id);
  report.personas.push({role:p.role,city:p.city,ms,search:r.search,failedSources:r.failedSources,model:r.personalization,jobs:r.jobs.map(j=>({company:j.company,title:j.title,location:j.location,url:j.url,reasons:j.reasons,description:j.description,requirements:j.jdRequirements})),restored:g.result?.runId===r.runId});
  report.checks.push({name:p.role+' bounded and grounded shortlist',pass:r.jobs.length<=5 && r.jobs.every(j=>j.url.startsWith('https://')&&j.reasons.some(x=>x.startsWith('岗位依据：')))});
  report.checks.push({name:p.role+' open runtime source wired and restored',pass:r.search.openSearch?.enabled===true&&g.result?.runId===r.runId});
  if(p.role==='机械工程师')report.checks.push({name:'manufacturing: at least two employers outside Tencent/NetEase',pass:new Set(r.jobs.filter(j=>!['腾讯','网易'].includes(j.company)).map(j=>j.company)).size>=2&&r.jobs.every(j=>/机械/.test(j.title))});
  if(p.role==='AI 产品经理')report.checks.push({name:'AI: at least one newly discovered employer',pass:r.jobs.some(j=>!['腾讯','网易'].includes(j.company))});
 }
}catch(e){report.error=e.message;process.exitCode=1;}
finally{
 const d=await db.from('users').delete().in('id',personas.map(p=>p.id));report.cleanup=!d.error;
 const path=process.env.AUDIT_OUTPUT||'/tmp/yizhi-open-job-search-acceptance.json';writeFileSync(path,JSON.stringify(report,null,2));
 const passed=!report.error&&report.cleanup&&report.checks.every(c=>c.pass);if(!passed)process.exitCode=1;
 console.log(JSON.stringify({passed,path,personas:report.personas.map(p=>({role:p.role,ms:p.ms,companies:p.jobs.map(j=>j.company),failedSources:p.failedSources})),checks:report.checks,cleanup:report.cleanup,error:report.error}));
}
