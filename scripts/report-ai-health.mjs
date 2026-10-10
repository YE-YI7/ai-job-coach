import {createClient} from '@supabase/supabase-js';
const days=Math.max(1,Math.min(30,Number(process.argv[2]||1)));
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const since=new Date(Date.now()-days*86400000).toISOString(),until=new Date().toISOString();
const rows=[];
for(let offset=0;offset<100000;offset+=1000){
 const {data,error}=await db.from('ai_generation_events').select('id,operation,model,status,latency_ms,retry_count,failure_type').gte('created_at',since).lte('created_at',until).order('created_at').order('id').range(offset,offset+999);
 if(error)throw Error(`AI health query failed: ${error.code||'database error'}`);
 rows.push(...data);if(data.length<1000)break;if(offset===99000)throw Error('Window too large; narrow it rather than report truncated totals');
}
const grouped=new Map();
for(const row of rows){const key=`${row.operation}:${row.model}`;grouped.set(key,[...(grouped.get(key)||[]),row]);}
const quantile=(values,p)=>values.length?values[Math.ceil(values.length*p)-1]:null;
const groups=[...grouped].map(([key,items])=>{
 const calls=items.filter(i=>i.status!=='stub'),success=calls.filter(i=>i.status==='success'),latencies=success.map(i=>i.latency_ms).sort((a,b)=>a-b);
 return {key,calls:calls.length,success:success.length,successRate:calls.length?success.length/calls.length:null,p50Ms:quantile(latencies,.5),p95Ms:quantile(latencies,.95),timeoutRate:calls.length?calls.filter(i=>i.failure_type==='timeout').length/calls.length:null,retriedCalls:calls.filter(i=>i.retry_count>0).length,retrySuccess:calls.filter(i=>i.retry_count>0&&i.status==='success').length,needsAttention:calls.length>=10&&success.length/calls.length<.9};
});
console.log(JSON.stringify({since,until,denominator:'model calls, not completed user tasks',groups,limitations:['Does not infer refund success from generation errors','Run manually or from a reviewed operations job; no external alert is sent']},null,2));
if(groups.some(g=>g.needsAttention))process.exitCode=2;
