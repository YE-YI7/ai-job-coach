import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {sha256} from './schema-baseline-utils.mjs';

/** Called only against the freshly created, portless, network:none test DB. */
export async function verifyLandingBudgetConcurrency(container,sql){
  assert.match(container,/^yizhi-schema-[a-f0-9-]+$/);
  const request=text=>new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t',
      '-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d','yizhi_isolated']);
    let out='',error='';
    child.stdout.on('data',chunk=>{out+=chunk;});
    child.stderr.on('data',chunk=>{error+=chunk;});
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(out.trim().split('\n').filter(Boolean)):reject(Error(error)));
    child.stdin.end(text);
  });
  const global=sha256('isolated-landing-global');
  const call=(ip,intent)=>`select allowed from public.consume_landing_mentor_budget('${sha256(ip)}','${global}','${sha256(intent)}');`;
  const clean=()=>sql(`delete from public.public_action_rate_limits
    where scope in ('landing-mentor-ip','landing-mentor-global','landing-mentor-once');`);
  try{
    // Eight simultaneous clients, four attempts per IP: global cap20, IP cap3.
    const requests=Array.from({length:8},(_,ip)=>request(
      Array.from({length:4},(_,n)=>call(`isolated-ip-${ip}`,`isolated-intent-${ip}-${n}`)).join('\n')));
    const responses=(await Promise.all(requests)).flat();
    assert.equal(responses.length,32);
    assert.equal(responses.filter(x=>x==='t').length,20);
    const counters=JSON.parse(sql(`select json_build_object(
      'global',(select sum(request_count) from public.public_action_rate_limits where scope='landing-mentor-global'),
      'ipTotal',(select sum(request_count) from public.public_action_rate_limits where scope='landing-mentor-ip'),
      'maxIp',(select max(request_count) from public.public_action_rate_limits where scope='landing-mentor-ip'),
      'intents',(select count(*) from public.public_action_rate_limits where scope='landing-mentor-once'))`));
    assert.equal(counters.global,20);assert.equal(counters.ipTotal,20);
    assert(counters.maxIp<=3);assert.equal(counters.intents,20);
    clean();
    const duplicate=await Promise.all(Array.from({length:8},(_,ip)=>request(call(`isolated-repeat-${ip}`,'same-intent'))));
    assert.equal(duplicate.flat().filter(x=>x==='t').length,1);
    assert.equal(Number(sql('select sum(request_count) from public.public_action_rate_limits')),3);
    return {parallelAttempts:32,accepted:20,deniedWithoutConsumption:12,
      concurrentDuplicateAttempts:8,duplicateAccepted:1,maximumIpConsumption:counters.maxIp};
  }finally{clean();}
}
