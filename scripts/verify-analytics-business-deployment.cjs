/* Exact deployed administrator GET acceptance. No accounts/permissions are
 * created or changed. A 30-second signed session stays in process memory and
 * curl stdin only (never flags, logs or files), then expiry is checked.
 * Requires existing project secrets injected by the platform; no model calls.
 */
const {spawnSync}=require('node:child_process'),{createHmac}=require('node:crypto');
const target=process.env.ANALYTICS_QA_DEPLOYMENT,admin=process.env.ANALYTICS_QA_ADMIN_ID;
if(!target||!/^https:\/\/ai-job-coach-[a-z0-9-]+\.vercel\.app$/.test(target)||!/^[a-f0-9-]{36}$/i.test(admin||''))throw Error('Verified candidate and existing admin ID required');
const secret=process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret||secret.length<32)throw Error('Existing session signing configuration unavailable');
const checks=[];let lastToken,lastExpiry,serverStart,monoStart;
function curl(path,token,headers=false){
 if(!path.startsWith('/api/admin/analytics?')&&!path.startsWith('/api/admin/eval-runs?')&&path!=='/api/health')throw Error('GET allowlist rejected path');
 const args=['curl',path,'--deployment',target,'--','--silent','--show-error','--include','--config','-'];
 const child=spawnSync('vercel',args,{input:token?`header = "Cookie: sb-access-token=${token}"\n`:'',encoding:'utf8',timeout:45000,maxBuffer:4000000});if(child.status!==0)throw Error('Protected GET failed');
 const raw=child.stdout,split=raw.lastIndexOf('\r\n\r\n'),boundary=split>=0?split:raw.indexOf('\n\n');
 const prefix=raw.slice(0,boundary),body=raw.slice(boundary+(split>=0?4:2));
 const status=Number([...prefix.matchAll(/HTTP\/[^ ]+ (\d+)/g)].at(-1)?.[1]);
 if(headers)return {status,headers:prefix,body};
 let data;try{data=JSON.parse(body);}catch{throw Error('Non-JSON GET response');}return {status,data};
}
function token(){const exp=Math.floor((serverStart+performance.now()-monoStart)/1000)+30,payload=Buffer.from(JSON.stringify({userId:admin,exp,version:2})).toString('base64url');lastToken=`${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;lastExpiry=exp;return lastToken;}
function get(path){return curl(path,token());}
function verify(condition,label){if(!condition)throw Error(`Acceptance failed: ${label}`);checks.push(label);}
(async()=>{
 const health=curl('/api/health',null,true);verify(health.status===200,'Candidate health 200');
 serverStart=Date.parse(health.headers.match(/^date:\s*(.+)$/mi)?.[1]||'');monoStart=performance.now();if(!Number.isFinite(serverStart))throw Error('Server clock required for short-lived session');
 const from=process.env.ANALYTICS_QA_FROM||'2026-09-23',to=process.env.ANALYTICS_QA_TO||'2026-10-22';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('Explicit date range required');
 const range=`from=${from}&to=${to}`,first=get(`/api/admin/analytics?view=users&${range}`);verify(first.status===200&&Boolean(first.data.dataset),'Actual admin business API 200');
 const d=first.data.dataset,snapshot=encodeURIComponent(d.window.asOf),owner=get(`/api/admin/analytics?view=users&${range}&scope=all&search=${admin.toUpperCase()}&asOf=${snapshot}`);verify(owner.status===200&&owner.data.dataset.users.total===0,'Owner excluded from dataset including uppercase ID');
 verify(get(`/api/admin/analytics?view=sessions&${range}&userId=${admin.toUpperCase()}&asOf=${snapshot}`).status===404,'Owner direct detail excluded before content');
 const daily=get(`/api/admin/analytics?view=daily&${range}&asOf=${snapshot}`);verify(daily.status===200&&daily.data.dataset.rows.length===Math.round((Date.parse(to)-Date.parse(from))/86400000)+1,'Actual arbitrary date range reads daily rows');
 const all=get(`/api/admin/analytics?view=users&${range}&scope=all&asOf=${snapshot}`);verify(all.status===200,'Actual all-user scope reads full population');
 if(all.data.dataset.users.nextOffset!==null){const p=get(`/api/admin/analytics?view=users&${range}&scope=all&asOf=${snapshot}&offset=${all.data.dataset.users.nextOffset}`);verify(p.status===200&&p.data.dataset.window.asOf===d.window.asOf&&p.data.dataset.users.rows.every(u=>!all.data.dataset.users.rows.some(a=>a.id===u.id)),'Actual user pagination retains asOf without overlapping users');}
 const u=d.users.rows.find(u=>u.sent>0);verify(Boolean(u),'Saved-user-message sample exists for real session acceptance');let detail=null;
 if(u){const r=get(`/api/admin/analytics?view=sessions&${range}&userId=${u.id}&asOf=${snapshot}`);verify(r.status===200&&Boolean(r.data.sessions),'Actual non-internal user drilldown');detail=r.data.sessions;
  verify(Boolean(detail.sessionPage.rows[0]),'Saved conversation can be selected');
  if(detail.sessionPage.rows[0]){const s=get(`/api/admin/analytics?view=sessions&${range}&userId=${u.id}&asOf=${snapshot}&session=${encodeURIComponent(detail.sessionPage.rows[0].id)}`);verify(s.status===200&&s.data.sessions.selectedSession?.turns.total>0,'Actual saved conversation read');}
  if(detail.opportunities[0]){const m=get(`/api/admin/analytics?view=material&${range}&userId=${u.id}&asOf=${snapshot}&opportunityId=${detail.opportunities[0].id}`);verify(m.status===200&&Boolean(m.data.material),'Actual owned current material read');}
  if(detail.traces[0]){const t=detail.traces[0],r=get(`/api/admin/eval-runs?id=${t.runId||t.traceId}`);verify(r.status===200,'Actual linked Trace resolves by exact ID');}
 }
 if(d.users.nextOffset!==null){const p=get(`/api/admin/analytics?view=users&${range}&asOf=${snapshot}&offset=${d.users.nextOffset}`);verify(p.status===200&&p.data.dataset.window.asOf===d.window.asOf,'Actual user pagination retains asOf');}
 // Expiry uses the verified platform clock, not this host's potentially skewed wall clock.
 const remaining=lastExpiry*1000-(serverStart+performance.now()-monoStart)+2000;
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(remaining,35000)));
 verify(curl(`/api/admin/analytics?view=users&${range}`,lastToken).status===401,'Ephemeral acceptance session has expired');lastToken='';
 console.log(JSON.stringify({readOnly:true,target,checks,users:d.users.total,days:d.rows.map(r=>({day:r.day,active:r.activeUsers,registered:r.registered})),selectedUser:detail?{sessions:detail.sessionPage.total,messages:detail.metrics.sent,traces:detail.traces.length,materials:detail.opportunities.length}:null,credentialsSaved:false},null,2));
})().catch(error=>{lastToken='';console.error(error.message?.startsWith('Acceptance failed:')?error.message:'Deployed read-only acceptance failed; no content or credential output.');process.exitCode=1;});
