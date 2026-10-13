import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {jsPDF} from 'jspdf';
import assert from 'node:assert/strict';

// Integration evidence only; Chrome interaction and PDF rendering are separate.
if(process.env.RUN_RESUME_ACCEPTANCE!=='1')throw Error('Synthetic-account opt-in required');
const target=process.argv[2];
if(target!=='https://www.ai-job-coach.xin')throw Error('Use the verified formal domain');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const uid=randomUUID(),email=`resume-acceptance-${uid}@example.invalid`,paths=[];
const payload=Buffer.from(JSON.stringify({version:2,userId:uid,email,exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
const signature=createHmac('sha256',process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('base64url');
const headers={Cookie:`sb-access-token=${payload}.${signature}`};
const observations=[];
async function request(path,method='GET',body){
 const form=body instanceof FormData;
 const response=await fetch(target+path,{method,headers:{...headers,...(body&&!form?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(190000),redirect:'manual'});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw Error(`Non-JSON HTTP ${response.status}`);}
 return {status:response.status,data};
}
async function original(label){
 const pdf=new jsPDF();pdf.text(`SYNTHETIC RESUME ${label}`,20,25);pdf.text('Original typography and layout must remain unchanged.',20,45);
 const bytes=Buffer.from(pdf.output('arraybuffer'));const form=new FormData();form.set('file',new File([bytes],`synthetic-${label}.pdf`,{type:'application/pdf'}));
 const saved=await request('/api/coach/resume-original','POST',form);assert.equal(saved.status,200, saved.data.error);paths.push(saved.data.original.path);
 const url=`${target}/api/coach/resume-original?path=${encodeURIComponent(saved.data.original.path)}`;
 const read=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});assert.equal(read.status,200);
 const back=Buffer.from(await read.arrayBuffer());assert.equal(createHash('sha256').update(back).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 assert.equal(read.headers.get('cache-control'),'private, no-store');
 assert.equal((await fetch(url,{signal:AbortSignal.timeout(30000)})).status,401);
 return saved.data.original;
}
try{
 const inserted=await db.from('users').insert({id:uid,email,provider:'email',nickname:'Synthetic resume acceptance'});if(inserted.error)throw Error(`Fixture setup ${inserted.error.code}`);
 const before=await request('/api/quota/check');assert.equal(before.status,200);
 const source='林测试\n\n项目经历\n客服工单流程改进 | 产品助理 | 2024.01–2024.06\n协助项目负责人整理访谈记录，梳理工单分派、升级和结案流程，产出12项需求清单，参与10轮可用性走查。我负责访谈记录和需求整理，没有独立负责产品上线，也没有提供业务指标提升的数据。\n\n教育经历\n示例大学 | 信息管理 | 本科 | 2020–2024';
 const intake=await request('/api/opportunities/analyze','POST',{mode:'save_only',materialKindHint:'resume',sourceText:source});assert.equal(intake.status,200);assert.equal(intake.data.input.resumeText,source);assert.equal(intake.data.savedOnly,true);
 const oldOriginal=await original('first');observations.push('Private original uploaded/read with identical bytes; anonymous read rejected');
 const created=await request('/api/coach/opportunities','POST',{opportunity:{workspaceType:'preparation',company:'求职准备',role:'简历优化',location:'地点待确认',stage:'evaluating',stageLabel:'准备中',priority:'medium',jdText:'',resumeText:source,resumeOriginal:oldOriginal,resumeRevision:randomUUID(),resumeChanges:[],requirements:[],actions:[],activities:[],interviewFocus:[],evidenceCoverage:{strong:0,weak:0,missing:0,unverified:0}}});assert.equal(created.status,201,created.data.error);const opportunity=created.data.opportunity;
 const afterSave=await request('/api/quota/check');assert.deepEqual(afterSave.data.quota,before.data.quota);observations.push('Resume-only intake and cloud save require no JD and do not debit quota');
 const generated=await request('/api/coach/resume-draft','POST',{opportunityId:opportunity.id,resumeText:source,jobDescription:'',mode:'general_resume',requestId:randomUUID()});
 if(generated.status!==200){const refunded=await request('/api/quota/check');assert.deepEqual(refunded.data.quota,afterSave.data.quota);observations.push('Failed model call preserves source and returns reserved quota');}
 assert.equal(generated.status,200,generated.data.error);assert.ok(generated.data.changes.length>0);observations.push(`Real model generated ${generated.data.changes.length} grounded suggestions without a JD`);
 const draft={...opportunity,resumeChanges:generated.data.changes,applicationQuality:generated.data.applicationQuality};
 assert.equal((await request('/api/coach/opportunities','PATCH',{opportunity:draft,preserveStage:true})).status,200);
 const loaded=await request('/api/coach/opportunities');const readBack=loaded.data.opportunities.find(item=>item.id===opportunity.id);assert.ok(readBack);assert.equal(readBack.resumeOriginal.path,oldOriginal.path);assert.ok(readBack.resumeChanges.length>0);observations.push('Generated suggestions and original reference survive independent cloud read');
 const newSource='林测试\n\n项目经历\n库存台账整理 | 运营助理 | 2024.07–2024.10\n整理3类入库凭证，核对库存台账中的编码和数量，不负责采购决策，没有节约成本的数据。';
 const newOriginal=await original('replacement');const replacement={...readBack,resumeText:newSource,resumeOriginal:newOriginal,resumeRevision:randomUUID(),resumeChanges:[],applicationQuality:undefined};
 assert.equal((await request('/api/coach/opportunities','PATCH',{opportunity:replacement,preserveStage:true,replaceResume:true,expectedResumeRevision:readBack.resumeRevision})).status,200);
 assert.equal((await request('/api/coach/opportunities','PATCH',{opportunity:draft,preserveStage:true})).status,409);
 const final=(await request('/api/coach/opportunities')).data.opportunities.find(item=>item.id===opportunity.id);
 assert.equal(final.resumeText,newSource);assert.equal(final.resumeOriginal.path,newOriginal.path);assert.equal(final.resumeChanges.length,0);assert.equal(final.applicationQuality,undefined);observations.push('Replacement persists; stale autosave rejected; previous generated advice does not reappear');
 console.log(JSON.stringify({target,synthetic:true,passed:true,observations},null,2));
}catch(error){console.log(JSON.stringify({target,synthetic:true,passed:false,failure:error.message,observations},null,2));process.exitCode=1;}
finally{
 if(paths.length){const removed=await db.storage.from('resume-originals').remove(paths);if(removed.error){console.error('Synthetic originals cleanup failed');process.exitCode=1;}}
 const removed=await db.from('users').delete().eq('id',uid).eq('email',email);if(removed.error){console.error('Synthetic fixture cleanup failed');process.exitCode=1;}
}
