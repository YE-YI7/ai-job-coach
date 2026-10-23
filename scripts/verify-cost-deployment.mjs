// Two real calls through the normal deployed QA login/chat path, never real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const args=process.argv;
assert(args.includes('--live'),'Explicit --live required: two supplier calls, no automatic retries');
const fixture=JSON.parse(fs.readFileSync(args[args.indexOf('--fixture')+1],'utf8'));
const origin=new URL(fixture.origin).origin;
assert(origin.startsWith('https://ai-job-coach-')&&origin.endsWith('.vercel.app'),'Use the isolated project deployment');
const jar=fs.readFileSync(fixture.cookieJar,'utf8').split('\n').filter(line=>line&&!line.startsWith('#')||line.startsWith('#HttpOnly_'));
const cookies=new Map(jar.map(line=>{const p=line.replace(/^#HttpOnly_/,'').split('\t');return[p[5],p[6]];}));
async function request(path,options={}) {
  const response=await fetch(origin+path,{...options,headers:{'content-type':'application/json',
    cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
  for(const cookie of response.headers.getSetCookie()){
    const [pair]=cookie.split(';');const i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));
  }
  assert(response.ok,`QA ${path} HTTP ${response.status}`);return response;
}
const startedAt=new Date().toISOString();
const logged=await(await request('/api/auth/verify-code',{method:'POST',body:JSON.stringify({email:fixture.email,code:fixture.invite})})).json();
assert.equal(logged.userId,fixture.userId,'Must reuse only the explicitly synthetic QA identity');
const records=[];
try {
  for(const stream of [false,true]){
    const requestId=randomUUID();
    const message='这是虚构产品练习：为图书馆设计自助预约系统，目标是减少前台重复答疑，不涉及真实用户。请用两句话解释目标和方案的区别，再问我一个澄清问题。';
    const response=await request('/api/coach/agent',{method:'POST',
      headers:{accept:stream?'application/x-ndjson':'application/json','x-idempotency-key':requestId},
      body:JSON.stringify({message,requestId,modelMode:'auto'})});
    const raw=await response.text();
    const events=stream?raw.trim().split('\n').map(line=>JSON.parse(line)):[];
    const result=stream?events.findLast(event=>event.type==='done'):JSON.parse(raw);
    assert(result?.ok && result.answer?.trim(),'Chat did not durably complete');
    assert.equal(result.learning_trace?.modelCalls,1,'Unexpected extra model calls');
    const usage=result.learning_trace?.modelUsage;
    assert(usage?.inputTokens>0&&usage?.outputTokens>0,'Missing real model usage');
    assert.equal(usage.provider,'stepfun');
    assert(usage.estimatedCostUsd>0&&usage.pricingVersion?.includes('2026-10-23'),'Missing dated cost callback');
    if(stream)assert(events.some(event=>['delta','replace'].includes(event.type)),'No progressive output');
    const history=await(await request('/api/coach/agent')).json();
    assert(history.turns?.some(turn=>turn.id===result.id&&turn.answer===result.answer),'Answer did not survive refresh read');
    records.push({requestId,stream,turnId:result.id,answer:result.answer,usage,
      progressive:stream?events.filter(event=>['delta','replace'].includes(event.type)).length:null,refreshMatched:true});
  }
}finally{
  await request('/api/auth/logout',{method:'POST'}).catch(()=>{});
  cookies.clear();
}
const report={startedAt,completedAt:new Date().toISOString(),origin,userId:fixture.userId,
  kind:'deployed-cost-acceptance',calls:2,records};
fs.writeFileSync(args[args.indexOf('--out')+1],JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({passed:true,calls:2,requests:records.map(r=>r.requestId),refresh:true}));
