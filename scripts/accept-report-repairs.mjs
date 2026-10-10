import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

// Explicit opt-in. Creates and removes only its unique synthetic fixture.
if(process.env.RUN_REPORT_ACCEPTANCE!=='1')throw Error('Set RUN_REPORT_ACCEPTANCE=1 for synthetic-account acceptance');
const target=process.argv[2];if(!/^https:\/\/[\w.-]+\.vercel\.app$/.test(target||''))throw Error('Use an exact staged Vercel deployment URL');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const uid=randomUUID(),email=`report-acceptance-${uid}@example.invalid`,temp=await mkdtemp(join(tmpdir(),'yizhi-acceptance-'));
const payload=Buffer.from(JSON.stringify({version:2,userId:uid,email,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const signed=`${payload}.${createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url')}`;
const config=join(temp,'curl-auth');await writeFile(config,`cookie = "sb-access-token=${signed}"\n`,{mode:0o600});
const observations=[];
async function request(path,method='GET',body){
 const args=['curl',path,'--deployment',target,'--','--silent','--show-error','--max-time','115','--config',config,'-X',method,'-w','\n%{http_code}'];
 if(body!==undefined)args.push('-H','Content-Type: application/json','--data-binary','@-');
 const output=await new Promise((resolve,reject)=>{
  const child=spawn('vercel',args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(`HTTP transport failed (${code}); details withheld`)));child.stdin.end(body===undefined?'':JSON.stringify(body));
 });
 const at=output.lastIndexOf('\n'),status=Number(output.slice(at+1)),data=JSON.parse(output.slice(0,at));return {status,data};
}
try{
 const inserted=await db.from('users').insert({id:uid,email,provider:'email',nickname:'Synthetic report acceptance'});if(inserted.error)throw Error(`Fixture creation failed: ${inserted.error.code}`);
 const before=await request('/api/quota/check');assert.equal(before.status,200);
 const resume='许澄，4年B2B SaaS产品经验，杭州。\n参与企业权限灰度上线。团队留存提升7个百分点。\n负责审批流程需求梳理。审批完成率从68%提升至81%，属于团队共同成果。\n没有AI或大模型项目交付经验。';
 const saved=await request('/api/opportunities/analyze','POST',{mode:'save_only',materialKindHint:'resume',sourceText:resume});assert.equal(saved.data.savedOnly,true);assert.equal(saved.data.input.resumeText,resume);
 const after=await request('/api/quota/check');assert.deepEqual(after.data.quota,before.data.quota);observations.push({test:'free source extraction',passed:true});
 const intake=await request('/api/opportunities/analyze','POST',{materialKindHint:'preparation',sourceText:'求职方向：杭州B2B产品经理',resumeText:resume,requestId:randomUUID()});
 assert.equal(intake.status,200);assert.equal(intake.data.ok,true);assert.ok(intake.data.analysis,'Hosted material analysis did not produce a verdict');observations.push({test:'hosted material analysis',passed:true});
 const opportunity={...intake.data.input,...intake.data.analysis,stage:'evaluating',stageLabel:'准备中',priority:'medium',capturedAtLabel:'刚刚',nextEventLabel:'今天完成第一步',activities:[],resumeChanges:[]};
 const created=await request('/api/coach/opportunities','POST',{opportunity,intakeRequestId:randomUUID()});assert.equal(created.status,201);
 const opportunityId=created.data.opportunity.id;
 const opened=await request('/api/coach/agent/sessions','POST',{opportunityId,title:'Synthetic grounded rewrite'});assert.equal(opened.status,201);const sessionId=opened.data.session.id;
 const requestId=randomUUID(),text='基于已确认简历事实，输出两条可直接放进简历的经历bullet，保留团队结果归属。';
 assert.equal((await request('/api/coach/agent/pending','POST',{sessionId,requestId,text})).status,201);
 const recovered=await request(`/api/coach/agent/pending?sessionId=${sessionId}`);assert.equal(recovered.data.pending.text,text);observations.push({test:'cloud answer recovery without browser storage',passed:true});
 if(!process.argv.includes('--interview-only')){
  const turn=await request('/api/coach/agent','POST',{opportunityId,sessionId,requestId,message:text,modelMode:'auto'});
  assert.equal(turn.status,200,`Grounded coach failed (${turn.status}): ${turn.data.error||'no error details'}`);assert.match(turn.data.answer,/简历改写草稿/);assert.match(turn.data.answer,/第 2 条/);assert.doesNotMatch(turn.data.answer,/主导企业权限|交付大模型/);observations.push({test:'two grounded editable bullets',passed:true});
  const committed=await request(`/api/coach/agent/pending?sessionId=${sessionId}`);assert.equal(committed.data.pending,null);observations.push({test:'completed answer not restored when cleanup has not run',passed:true});
 }
 const interviewSession=await request('/api/coach/agent/sessions','POST',{opportunityId,title:'Synthetic one-question interview'});assert.equal(interviewSession.status,201);
 const interviewId=interviewSession.data.session.id;
 const first=await request('/api/coach/agent','POST',{opportunityId,sessionId:interviewId,requestId:randomUUID(),message:'现在开始模拟面试，你扮演面试官，每次只问一个问题，不要先给答案或评价。第一题围绕审批流程的业务判断与个人贡献。',modelMode:'auto'});
 assert.equal(first.status,200,'Hosted first interview question failed');assert.equal((first.data.answer.match(/[?？]/g)||[]).length,1);assert.doesNotMatch(first.data.answer,/范文|练习示例|参考答案|本题反馈/);observations.push({test:'hosted first interview question without pre-answer coaching',passed:true});
 const follow=await request('/api/coach/agent','POST',{opportunityId,sessionId:interviewId,requestId:randomUUID(),message:'我负责审批流程需求梳理，参与企业权限灰度上线。审批完成率从68%到81%是团队共同成果。我没有AI或大模型项目交付经验。',modelMode:'auto'});
 assert.equal(follow.status,200,'Hosted interview follow-up failed');assert.match(follow.data.answer,/本题反馈/);assert.match(follow.data.answer,/追问/);assert.equal((follow.data.answer.match(/[?？]/g)||[]).length,1);observations.push({test:'hosted interview feedback and exactly one follow-up',passed:true});
 console.log(JSON.stringify({target,synthetic:true,observations},null,2));
}catch(error){console.log(JSON.stringify({target,synthetic:true,observations,failure:error.message},null,2));process.exitCode=1;}
finally{
 const removed=await db.from('users').delete().eq('id',uid).eq('email',email);if(removed.error){console.error('Synthetic fixture cleanup needs retry for this run only');process.exitCode=1;}
 await rm(temp,{recursive:true,force:true});
}
