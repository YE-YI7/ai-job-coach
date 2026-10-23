import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Normal invite login, newly provisioned synthetic account only. No production
// user session, linked model, wallet, or access-key material is read by this test.
const [phase,dir,origin,index='0']=process.argv.slice(2);
assert.ok(dir&&/^https:\/\/ai-job-coach-[a-z0-9]+-velmavalienteqejimu22-jpgs-projects\.vercel\.app$/.test(origin));
const q=JSON.parse(readFileSync(join(dir,'private.json'),'utf8'));
const {chromium,request}=createRequire('/Users/yi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const output=join(dir,'evidence',...(phase==='browser'?['browser-'+index]:[]));mkdirSync(output,{recursive:true});
const state=join(dir,'session.json');
const source=[`陈知远（虚构验收材料）
求职方向：产品助理
## 教育背景
示例大学 | 信息管理 | 本科 | 2022.09–2026.06
## 项目经历
### 校园知识库整理工具（虚构项目） | 产品助理 | 2025.03–2025.07
- 负责整理知识库，整理了30条示例问答。逐条核对来源与分类后，把整理好的问答交给3位同学试用。
- 收集了8条使用反馈，整理成表单校验和检索结果的修改清单，交给开发同学调整。
- 对修改后的8条问题逐项复测，在清单标注复测结果，确认其中6条已修正，2条继续跟进。
## 技能
Excel：用筛选、透视表汇总反馈；Figma：绘制表单和检索页原型。`,
`林予安（虚构 OCR 验收材料）
求职方向：电商运营助理
教育背景
示例大学 国际经济与贸易 本科 2022.09-2026.06
实习经历
示例电商实验室 亚马逊运营助理 2025.07-2025.09
负责亚马逊店铺日常运营，主要做产品上架和链接整理。独立完成260条商品链接搭建与上架，收集竞品标题及详情页信息，整理为标题和详情页修改清单。实习期间协助店铺完成105件商品销售，未统计个人贡献比例。
协助处理客户售前咨询，跟进订单履约全流程，把咨询内容、订单处理进度记录在Excel中，每周交给运营负责人。
项目经历
TikTok泰国男装店铺实训 实训成员 2025.05-2025.06
参与店铺0-1搭建，负责市场与竞品调研、商品上架及文案撰写。累计完成103款商品上架，每周汇总访客、曝光和成交数据，完成一次实训复盘。
个人技能
大学英语四级，可阅读英文业务资料。掌握Excel筛选、常用公式和透视表。`];
const save=(name,data)=>writeFileSync(join(output,name+'.json'),JSON.stringify(data,null,2),{mode:0o600});
const protection=process.env.VERCEL_OIDC_TOKEN?{'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}:{};
const initialCookies=readFileSync(join(dir,'deployment-cookies.txt'),'utf8').split('\n').filter(line=>line.split('\t').length===7).map(line=>{
 const [domain,,path,secure,expires,name,value]=line.split('\t');return {name,value,domain:domain.replace(/^#HttpOnly_/,''),path,secure:secure==='TRUE',httpOnly:domain.startsWith('#HttpOnly_'),expires:Number(expires)||-1,sameSite:'Lax'};
});
const api=await request.newContext({baseURL:origin,extraHTTPHeaders:protection,storageState:['seed','login'].includes(phase)?{cookies:initialCookies,origins:[]}:state,timeout:285000});
try{
 if(phase==='login'){
  const auth=await api.post('/api/auth/verify-code',{data:{email:q.email,code:q.code}});
  assert.equal(auth.status(),200);assert.equal((await auth.json()).userId,q.id);
  await api.storageState({path:state});console.log(JSON.stringify({phase,passed:true,sameSyntheticAccount:true}));
 }else if(phase==='seed'){
  const auth=await api.post('/api/auth/verify-code',{data:{email:q.email,code:q.code}});
  assert.equal(auth.status(),200);assert.equal((await auth.json()).userId,q.id);
  await api.storageState({path:state});
  q.opportunityIds=[];
  for(let i=0;i<source.length;i++){
   const result=await api.post('/api/coach/opportunities',{data:{opportunity:{workspaceType:'preparation',company:'虚构验收材料',role:i?'电商运营助理':'产品助理',location:'国内',stage:'evaluating',stageLabel:'准备中',priority:'medium',sourceLabel:'隔离 QA',capturedAtLabel:'今日',jdText:'',resumeText:source[i],profileText:source[i],nextEventLabel:null,recommendation:'prepare_then_apply',recommendationLabel:'准备',recommendationReason:'虚构验收，不用于投递',evidenceCoverage:{strong:0,weak:0,missing:0,unverified:0},requirements:[],actions:[],activities:[],resumeChanges:[],interviewFocus:[]}}});
   assert.equal(result.status(),201,await result.text());q.opportunityIds.push((await result.json()).opportunity.id);
  }
  writeFileSync(join(dir,'private.json'),JSON.stringify(q),{mode:0o600});save('inputs',{synthetic:true,source,opportunityIds:q.opportunityIds});
  console.log(JSON.stringify({phase,passed:true,syntheticUsers:1,opportunities:q.opportunityIds}));
 }else if(phase==='generate'){
  const i=Number(index),started=Date.now();assert.ok(i===0||i===1);
  // Exactly one explicit full-edit attempt per fixture. No automatic retry.
  const response=await api.post('/api/coach/resume-agent',{data:{opportunityId:q.opportunityIds[i],action:'restart'}});
  const body=await response.json();save('model-'+i,{http:response.status(),durationMs:Date.now()-started,...body});
  console.log(JSON.stringify({phase,index:i,http:response.status(),durationMs:Date.now()-started,state:body.task?.state,error:body.task?.error||body.error,delivery:body.task?.delivery,changes:body.task?.result?.changes?.map(c=>({id:c.id,before:c.before,after:c.after}))}));
  assert.equal(response.status(),200);assert.equal(body.ok,true);assert.equal(body.task?.state,'ready');
  assert.ok(body.task.result.changes.length>0,'Actual model must produce usable changes');
  assert.ok(body.task.result.changes.some(c=>/实习|项目|工作|经历/.test(c.section)&&/负责|参与|整理|协助|完成/.test(c.before)),'A separator-only education/skill edit is not an experience rewrite');
  assert.equal(body.task.delivery.persistence,'confirmed');assert.ok(['delivered','partial_delivered'].includes(body.task.delivery.outcome));
 }else if(phase==='browser'){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({storageState:state,viewport:{width:1512,height:982}});
  const selectedId=q.opportunityIds[Number(index)];
  await context.addInitScript(({owner,id})=>{
   if(!sessionStorage.getItem('qa-selected-workspace')){
    localStorage.setItem('yizhi:workspace-view:v1:'+owner,JSON.stringify({opportunityId:id,tab:'resume'}));
    sessionStorage.setItem('qa-selected-workspace','yes');
   }
  },{owner:q.id,id:selectedId});
  await context.route('**/*',route=>route.continue({headers:{...route.request().headers(),...(new URL(route.request().url()).origin===origin?protection:{})}}));
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  try{
   await page.goto(origin+'/cockpit',{waitUntil:'domcontentloaded'});
   // Only the synthetic account's owned navigation preference is initialized.
   const paper=page.frameLocator('iframe[title="简历 · 原位修改"]');
   await paper.locator('main').waitFor();
   await page.screenshot({path:join(output,'desktop.png')});
   // Click the app's actual inline decision, not a handcrafted PATCH.
   const marks=paper.locator('mark[data-ink]');
   await marks.first().click();
   const decided=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/product-events'&&r.request().postDataJSON()?.name==='resume_change_decided',{timeout:45000});void decided.catch(()=>{});
   await page.getByRole('button',{name:'采纳这处修改',exact:true}).click();
   assert.equal((await decided).status(),200,'A fast adoption must have an authoritative delivery event');
   await page.getByText('已保存到工作区',{exact:true}).waitFor({timeout:45000});
   let list=await (await context.request.get(origin+'/api/coach/opportunities')).json();
   const own=list.opportunities.find(o=>o.id===selectedId);
   assert.ok(own.resumeChanges.some(c=>c.status==='accepted'));
   await page.reload({waitUntil:'domcontentloaded'});
   await paper.locator('main').waitFor();
   list=await (await context.request.get(origin+'/api/coach/opportunities')).json();
   const refreshed=list.opportunities.find(o=>o.id===selectedId);
   assert.deepEqual(refreshed.resumeChanges,own.resumeChanges);
   save('save-refresh',{passed:true,opportunityId:own.id,changes:refreshed.resumeChanges,generationId:refreshed.resumeGenerationId});
   await page.getByRole('button',{name:'其他辅导',exact:true}).click();
   await page.getByRole('button',{name:/^选择导师模型/}).click();
   const modelPanel=page.getByRole('dialog',{name:'选择导师模型',exact:true});
   assert.ok(await modelPanel.locator('img').count()>0,'Keep provider logos in the model selector');
   await page.screenshot({path:join(output,'model-picker.png')});
   await page.getByRole('option',{name:/实惠档/}).click();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'其他辅导',exact:true}).click();
   await page.getByRole('button',{name:'选择导师模型：实惠档 · 站点模型',exact:true}).waitFor();
   await page.getByRole('button',{name:'简历修改',exact:true}).click();
   await paper.locator('main').waitFor();
   await page.screenshot({path:join(output,'saved-refresh.png')});
   const exportButton=page.getByRole('button',{name:'导出 PDF',exact:true});
   assert.equal(await exportButton.isDisabled(),false);
   const opened=context.waitForEvent('page',{timeout:30000});void opened.catch(()=>{});
   await exportButton.click();
   const confirmation=page.getByRole('button',{name:'同意并导出',exact:true});
   if(await confirmation.isVisible())await confirmation.click();
   const preview=await opened;
   await preview.getByRole('button',{name:'保存为 PDF',exact:true}).waitFor();
   assert.equal(await preview.locator('.resume-edit,.resume-grip,.resume-live-editor,mark[data-ink]').count(),0);
   await preview.evaluate(()=>{window.qaPrintEvents=0;window.addEventListener('beforeprint',()=>window.qaPrintEvents++);});
   await preview.getByRole('button',{name:'保存为 PDF',exact:true}).click();
   assert.equal(await preview.evaluate(()=>window.qaPrintEvents),1);
   await preview.pdf({path:join(output,'resume-delivery.pdf'),preferCSSPageSize:true,printBackground:true});
   save('export',{passed:true,printEvents:1,text:await preview.locator('main').innerText()});await preview.close();
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:join(output,'mobile.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   save('browser-result',{passed:true,pageErrors:errors,saveRefresh:true,actualAppPrint:true});
   assert.deepEqual(errors,[]);console.log(JSON.stringify({phase,passed:true,output}));
  }catch(error){await page.screenshot({path:join(output,'browser-failure.png')}).catch(()=>{});save('browser-failure',{error:String(error),url:page.url(),body:(await page.locator('body').innerText()).slice(0,12000)});throw error;}
  finally{await browser.close();}
 }else if(phase==='discussion'){
  const before=await (await api.get('/api/coach/opportunities')).json();
  const started=Date.now();
  const r=await api.post('/api/coach/resume-agent',{data:{opportunityId:q.opportunityIds[1],action:'message',requestId:randomUUID(),answer:'先不要修改简历，请用两点解释现在这段经历的亮点是什么。我们先讨论。'},headers:{accept:'application/x-ndjson'}});
  const body=await r.text();save('discussion',{http:r.status(),durationMs:Date.now()-started,body});assert.equal(r.status(),200);
  const events=body.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(events.at(-1).ok,true);assert.equal(events.at(-1).conversationDecision,'discuss');
  assert.ok(events.filter(e=>e.type==='replace').length>1,'Reply remains progressively renderable');
  const after=await (await api.get('/api/coach/opportunities')).json();
  const own=x=>x.opportunities.find(o=>o.id===q.opportunityIds[1]);
  assert.deepEqual(own(after).resumeChanges,own(before).resumeChanges);
  assert.equal(own(after).resumeGenerationId,own(before).resumeGenerationId);
  console.log(JSON.stringify({phase,passed:true,doesNotRewrite:true,durationMs:Date.now()-started}));
 }else throw new Error('unknown phase');
}finally{await api.dispose();}
