import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

// Never uses a real user's account, quota, cookies or data.
if(process.env.RUN_P0_ACCEPTANCE!=='1')throw Error('Explicit synthetic-account opt-in required');
const target=process.argv[2];if(!/^https:\/\/[\w.-]+\.vercel\.app$/.test(target||''))throw Error('Use an exact candidate deployment');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const uid=randomUUID(),email=`p0-acceptance-${uid}@example.invalid`,temp=await mkdtemp(join(tmpdir(),'yizhi-p0-acceptance-'));
const payload=Buffer.from(JSON.stringify({version:2,userId:uid,email,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const signed=`${payload}.${createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url')}`;
const config=join(temp,'curl-auth');await writeFile(config,`cookie = "sb-access-token=${signed}"\n`,{mode:0o600});
const observations=[];
async function request(path,method='GET',body){
 const args=['curl',path,'--deployment',target,'--','--silent','--show-error','--max-time','115','--config',config,'-X',method,'-w','\n%{http_code}'];
 if(body!==undefined)args.push('-H','Content-Type: application/json','--data-binary','@-');
 const output=await new Promise((resolve,reject)=>{const child=spawn('vercel',args,{stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.resume();child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(`Transport failed (${code}), details withheld`)));child.stdin.end(body===undefined?'':JSON.stringify(body));});
 const at=output.lastIndexOf('\n');return {status:Number(output.slice(at+1)),data:JSON.parse(output.slice(0,at))};
}
async function insert(table,row){const result=await db.from(table).insert(row);if(result.error)throw Error(`Synthetic ${table} insert failed: ${result.error.code}`);}
try{
 await insert('users',{id:uid,email,provider:'email',nickname:'Synthetic P0 acceptance'});
 const resume='许澄，4年B2B SaaS产品经验，杭州。参与企业权限灰度上线，负责审批流程需求梳理。审批完成率从68%提升至81%，属于团队共同成果。没有AI或大模型项目交付经验。';
 const job=randomUUID();await insert('coach_opportunities',{id:job,user_id:uid,company:'Synthetic SaaS',role:'B2B产品经理',jd_text:'负责杭州企业审批产品，重视权限灰度与业务判断，要求三年产品经验。',metadata:{resumeText:resume}});
 const sessionId=randomUUID(),questionId=randomUUID();await insert('interview_sessions',{id:sessionId,user_id:uid,jd:'企业审批产品经理',round_type:'业务面',question_count:1,opportunity_id:job});await insert('interview_questions',{id:questionId,session_id:sessionId,question_text:'请介绍审批流程项目中你的个人贡献。',tips:[]});
 const before=await request('/api/quota/check');assert.equal(before.status,200);
 const answer='我负责审批流程需求梳理，完成率变化属于团队共同成果。';
 const saved=await request('/api/interview/draft','POST',{sessionId,questionId,answer});assert.equal(saved.status,200);assert.equal(saved.data.saved,true);
 const recovered=await request(`/api/interview/draft?sessionId=${sessionId}&questionId=${questionId}`);assert.equal(recovered.data.answer,answer);
 const after=await request('/api/quota/check');assert.deepEqual(after.data.quota,before.data.quota);observations.push('answer persisted and recovered without quota charge');
 const foreign=await request('/api/interview/draft','POST',{sessionId:randomUUID(),questionId,answer});assert.equal(foreign.status,404);observations.push('foreign session rejected');
 const hugeSession=randomUUID(),hugeQuestion=randomUUID();await insert('interview_sessions',{id:hugeSession,user_id:uid,jd:'招聘要求：审批流程业务分析。'.repeat(15000),round_type:'业务面',question_count:1,opportunity_id:job});await insert('interview_questions',{id:hugeQuestion,session_id:hugeSession,question_text:'请说明个人贡献。',tips:[]});
 const failed=await request('/api/interview/answer','POST',{session_id:hugeSession,question_id:hugeQuestion,answer,opportunityId:job});assert.equal(failed.status,422,'Oversized context must explicitly stop before model generation');
 const retained=await request(`/api/interview/draft?sessionId=${hugeSession}&questionId=${hugeQuestion}`);assert.equal(retained.data.answer,answer);observations.push('context failure preserves exact submitted answer in cloud');
 const assessment={verdict:'partial',summary:'团队结果和个人贡献已区分',strengths:[],gaps:[],follow_up_questions:[]};await insert('interview_answers',{session_id:sessionId,question_id:questionId,answer,assessment});
 const completed=await request(`/api/interview/draft?sessionId=${sessionId}&questionId=${questionId}`);assert.equal(completed.data.answer,null);assert.equal(completed.data.completedAnswer,answer);assert.deepEqual(completed.data.assessment,assessment);observations.push('lost response recovers saved feedback instead of repeating generation');
 const opened=await request('/api/coach/agent/sessions','POST',{opportunityId:job,title:'Synthetic mode acceptance'});assert.equal(opened.status,201);const learning=opened.data.session.id;
 const zero=await db.from('user_quotas').update({free_chat_daily:0,free_resume_daily:0,paid_chat_remaining:0,paid_resume_remaining:0,paid_interview_remaining:0}).eq('user_id',uid);if(zero.error)throw Error('Synthetic quota setup failed');
 const empty=await request('/api/quota/check');assert.equal(empty.data.checks.interview.allowed,false);
 const firstAllowance=await request(`/api/quota/check?sessionId=${learning}`);assert.equal(firstAllowance.data.checks.chat.allowed,true);observations.push('zero quota preflight blocks new interview but preserves bounded first coaching allowance');
 const pendingId=randomUUID(),text='请围绕审批流程项目开始面试。';assert.equal((await request('/api/coach/agent/pending','POST',{sessionId:learning,requestId:pendingId,text,interactionMode:'mock_interview'})).status,201);
 const pending=await request(`/api/coach/agent/pending?sessionId=${learning}`);assert.equal(pending.data.pending.interactionMode,'mock_interview');observations.push('interviewer mode survives pending-answer recovery');
 const first=await request('/api/coach/agent','POST',{opportunityId:job,sessionId:learning,requestId:pendingId,message:text,interactionMode:'mock_interview',modelMode:'auto'});assert.equal(first.status,200,`First interview response failed: HTTP ${first.status}`);assert.equal((first.data.answer.match(/[?？]/g)||[]).length,1);assert.doesNotMatch(first.data.answer,/参考答案|练习示例|本题反馈/);observations.push('real model interviewer asks exactly one question without supplying answer');
 const follow=await request('/api/coach/agent','POST',{opportunityId:job,sessionId:learning,requestId:randomUUID(),message:answer,interactionMode:'mock_interview',modelMode:'auto'});assert.equal(follow.status,200,`Follow-up failed: HTTP ${follow.status}`);assert.match(follow.data.answer,/本题反馈/);assert.equal((follow.data.answer.match(/[?？]/g)||[]).length,1);observations.push('real model feedback contains exactly one follow-up');
 console.log(JSON.stringify({target,synthetic:true,observations,passed:true},null,2));
}catch(error){console.log(JSON.stringify({target,synthetic:true,observations,passed:false,failure:error.message},null,2));process.exitCode=1;}
finally{const removed=await db.from('users').delete().eq('id',uid).eq('email',email);if(removed.error){console.error('Synthetic fixture cleanup failed; retry this run only');process.exitCode=1;}await rm(temp,{recursive:true,force:true});}
