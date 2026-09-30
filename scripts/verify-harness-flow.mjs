// Synthetic-account acceptance only. No real user's account or content is read/modified.
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = process.argv[2] || 'http://localhost:3021';
if (!['http://localhost:3021','https://www.ai-job-coach.xin'].includes(base)) throw Error('Unexpected destination');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}});
const owner=randomUUID(), other=randomUUID();
function cookie(id){const p=Buffer.from(JSON.stringify({userId:id,version:2,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');return 'sb-access-token='+p+'.'+createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(p).digest('base64url');}
async function request(path,body,user=owner,method=body?'POST':'GET'){
 const streaming=path==='/api/coach/agent'&&body;
 const r=await fetch(base+path,{method,headers:{cookie:cookie(user),'Content-Type':'application/json',...(streaming?{Accept:'application/x-ndjson'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 const b=streaming&&r.headers.get('content-type')?.includes('ndjson')?JSON.parse((await r.text()).trim().split('\n').at(-1)):await r.json();
 if(!r.ok||b.ok===false)throw Error(`${path} status ${r.status}: ${b.error||'failed'}`);return b;
}
try{
 const users=await db.from('users').insert([owner,other].map(id=>({id,email:`harness-acceptance-${id}@example.invalid`})));if(users.error)throw users.error;
 const quota=await db.from('user_quotas').insert({user_id:owner,free_chat_daily:10,last_free_reset:new Date().toISOString().slice(0,10)});if(quota.error)throw quota.error;
 const created=await request('/api/coach/opportunities',{opportunity:{company:'验收公司',role:'产品经理',workspaceType:'job',stage:'applied',jdText:'负责发现用户问题、设计验证方案，能说明证据与方案的区别。',resumeText:'测试学生\n教育经历：本科\n项目：记录食堂排队时长，尚未访谈或上线。',requirements:[],activities:[]}});
 const job=created.opportunity;
 const unavailable=await request('/api/coach/research',{opportunityId:job.id});assert.equal(unavailable.status,'unavailable');
 const inaccessible=await fetch(base+'/api/coach/research',{method:'POST',headers:{cookie:cookie(other),'Content-Type':'application/json'},body:JSON.stringify({opportunityId:job.id})});assert.equal(inaccessible.status,404);
 const s=await request('/api/coach/agent/sessions',{opportunityId:job.id,title:'验收：从不会开始学习'});
 const first=await request('/api/coach/agent',{opportunityId:job.id,sessionId:s.session.id,modelMode:'fast',message:'我不会区分用户问题和解决方案。请从一个食堂排队的例子教我，先讲一点，再让我试一步，不要让我重新上传简历或JD。',requestId:randomUUID()});
 assert.ok(first.answer.trim());assert.equal(first.learning_trace.modelCalls,1);
 const stored=await db.from('coach_agent_turns').select('request_id,learning_trace').eq('id',first.id).eq('user_id',owner).single();if(stored.error)throw stored.error;
 assert.equal(stored.data.learning_trace.stateObservation.strategy,'lower_density');assert.ok(stored.data.learning_trace.compiledPrompt.includes('食堂'));
 await request('/api/coach/agent/sessions',{opportunityId:job.id,note:true,title:'验收学习笔记',summary:'先区分问题与方案；下一步记录排队时长。',sourceTurnId:first.id});
 const archived=await request('/api/coach/agent/archive',{sessionId:s.session.id});assert.ok(archived.ok);
 const next=await request('/api/coach/agent/sessions',{opportunityId:job.id,title:'验收：新窗口续学'});
 assert.equal((await request(`/api/coach/agent?opportunityId=${job.id}&sessionId=${next.session.id}`)).turns.length,0);
 const continued=await request('/api/coach/agent',{opportunityId:job.id,sessionId:next.session.id,modelMode:'fast',message:'接着上次的学习进展。我现在区分了问题和方案，请带我找一个能验证排队问题的证据。',requestId:randomUUID()});assert.equal(continued.learning_trace.memoryLoaded,true);
 const history=await request(`/api/coach/agent?opportunityId=${job.id}&sessionId=${next.session.id}`);assert.equal(history.turns.length,1);assert.ok(!('compiledPrompt' in history.turns[0].learning_trace));
 const foreign=await request(`/api/coach/agent?opportunityId=${job.id}&sessionId=${next.session.id}`,undefined,other);assert.equal(foreign.turns.length,0);
 const events=await db.from('product_events').select('event_name').eq('user_id',owner);if(events.error)throw events.error;
 assert.ok(events.data.some(e=>e.event_name==='agent_resume_saved'));assert.ok(events.data.some(e=>e.event_name==='agent_answer_started'));assert.ok(events.data.some(e=>e.event_name==='agent_answer_completed'));assert.ok(events.data.some(e=>e.event_name==='agent_answer_adopted'));
 const stage=await request('/api/coach/opportunities',{stageUpdate:{id:job.id,stage:'interviewing'}},owner,'PATCH');assert.equal(stage.ok,true);
 const current=await db.from('coach_opportunities').select('metadata,stage').eq('id',job.id).eq('user_id',owner).single();if(current.error)throw current.error;assert.ok(current.data.metadata.stageEnteredAt);assert.equal(current.data.stage,'interviewing');
 const interview=await request('/api/interview/start',{opportunityId:job.id,roundType:'业务面',questionCount:2,useResume:true,resumeText:job.resumeText});
 assert.equal(interview.questions.length,2);assert.ok(interview.questions.every(q=>new Set(q.sources.map(s=>s.source)).size>=2));
 const a=await request('/api/interview/answer',{session_id:interview.session_id,question_id:interview.questions[0].id,answer:'我在食堂排队项目中负责记录等待时间。第一步在三个午饭时段记录了20个人的排队时长，中位等待时间约十分钟。我还没有访谈或上线，因此这只能说明等待较长，不能证明用户愿意使用预约功能；下一步会询问他们何时最着急和正在采用什么替代办法。',opportunityId:job.id});assert.equal(a.assessment.status,'assessed');
 const follow=await request('/api/interview/next',{sessionId:interview.session_id,previousQuestionId:interview.questions[0].id,nextQuestionId:interview.questions[1].id});
 const audit=await db.from('coach_run_context_selections').select('rule,required,cost').eq('user_id',owner).eq('kind','attachment').limit(1).single();if(audit.error)throw audit.error;assert.ok(audit.data.rule);assert.ok(audit.data.cost>0);
 assert.equal(follow.question.linkage.kind,'linked');assert.ok(follow.question.linkage.tookFrom.every(t=>'我在食堂排队项目中负责记录等待时间。第一步在三个午饭时段记录了20个人的排队时长，中位等待时间约十分钟。我还没有访谈或上线，因此这只能说明等待较长，不能证明用户愿意使用预约功能；下一步会询问他们何时最着急和正在采用什么替代办法。'.replace(/\s/g,'').includes(t.replace(/\s/g,''))));
 if(process.env.HARNESS_BROWSER==='1'){
  const browser=(...args)=>execFileSync('agent-browser',['--session','yizhi-harness-synthetic',...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  try{
   browser('cookies','set','sb-access-token',cookie(owner).slice('sb-access-token='.length),'--url',base,'--httpOnly');
   browser('set','viewport','1440','900');browser('open',base+'/cockpit');browser('wait','--load','networkidle');
   const snapshot=browser('snapshot','-i');assert.ok(!snapshot.includes('textbox "邮箱地址或邀请码"'),'Authenticated cockpit unexpectedly opened login');
   browser('screenshot','/tmp/yizhi-harness-auth-desktop.png');
   browser('set','viewport','390','844');browser('wait','500');browser('screenshot','/tmp/yizhi-harness-auth-mobile.png');
   const width=browser('eval','JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth})');
   assert.ok(width.includes('390'),'Mobile viewport was not applied');
   console.log('Authenticated desktop/mobile cockpit screenshots captured; API flow assertions remain the functional evidence.');
  }finally{browser('cookies','clear');browser('close');}
 }
 console.log(JSON.stringify({passed:true,checks:['authenticated save','unknown company not guessed','owner isolation','real LLM teaching','one call per turn','state strategy','private prompt audit','save-to-note telemetry','archive','empty new conversation','memory reload','stage clock','sourced interview','linked follow-up from real previous answer'],firstTextMs:first.learning_trace.timing.firstTextMs,secondFirstTextMs:continued.learning_trace.timing.firstTextMs,inputTokens:[first.learning_trace.inputTokens,continued.learning_trace.inputTokens]}));
}finally{
 const removed=await db.from('users').delete().in('id',[owner,other]);if(removed.error)throw Error('Synthetic-account cleanup failed');
 console.log('Removed only the two synthetic test accounts and their cascading records.');
}
