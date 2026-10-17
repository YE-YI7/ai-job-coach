import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Explicit opt-in, normal login, isolated fictional material. No model calls,
// production-user cookies, auth impersonation or privileged browser session.
const origin=process.env.RESUME_MATERIAL_QA_ORIGIN||'https://www.ai-job-coach.xin';
const code=process.env.RESUME_MATERIAL_QA_CODE;
assert.ok(['https://www.ai-job-coach.xin','https://ai-job-coach.xin'].includes(origin));
assert.ok(process.env.RESUME_MATERIAL_QA_LIVE==='1'&&/^QA-MATERIAL-20261017-[A-Z0-9]+$/.test(code||''),'An explicitly provisioned one-use QA invite is required');
const {chromium}=createRequire(import.meta.url)('playwright');
const output=process.env.RESUME_MATERIAL_QA_OUTPUT||mkdtempSync(join(tmpdir(),'yizhi-material-production-'));
mkdirSync(output,{recursive:true});
const source=`陈知远（虚构验收材料）
电话：13800000017
邮箱：qa@example.invalid
求职方向：产品助理
## 项目经历
### 知识库整理工具（虚构项目）
2025.03–2025.07
- 整理 30 条示例问答，核对来源与分类，交给同学试用。
- 记录 8 条使用反馈，整理表单校验与检索结果的修改清单。
## 教育背景
示例大学 | 信息管理 | 本科 | 2022.09–2026.06
## 技能
Excel、Markdown、Figma。`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1512,height:982}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const checks=[],errors=[];let opportunityId,modelCalls=0;
page.on('pageerror',error=>errors.push(String(error)));
await page.route('**/api/coach/resume-agent',route=>{modelCalls++;return route.abort();});
const paper=page.frameLocator('iframe[title="简历 · 原位修改"]');
const saved=()=>page.getByText('已保存到工作区',{exact:true}).waitFor({timeout:45000});
const snapshot=name=>page.screenshot({path:join(output,name+'.png'),timeout:30000});
const readOwn=async()=>{
  const response=await context.request.get(origin+'/api/coach/opportunities');
  assert.equal(response.status(),200);
  const data=await response.json();
  assert.equal(data.opportunities.length,1,'QA account must contain only its own fictional workspace');
  assert.equal(data.opportunities[0].id,opportunityId);
  return data.opportunities[0];
};
try{
  await page.goto(origin+'/login?redirect=%2Fcockpit',{waitUntil:'domcontentloaded'});
  await page.getByPlaceholder('邮箱地址或邀请码').fill(code);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/cockpit',{timeout:45000});
  await page.getByRole('button',{name:'导入我的简历',exact:true}).click();
  await page.getByRole('textbox',{name:'求职材料内容',exact:true}).fill(source);
  const created=page.waitForResponse(response=>response.url().includes('/api/coach/opportunities')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'保存简历 · 免费',exact:true}).click();
  const response=await created;assert.equal(response.status(),201);
  opportunityId=(await response.json()).opportunity.id;
  await page.getByRole('button',{name:'打开简历，开始修改',exact:true}).click();
  await paper.getByRole('heading',{name:'项目经历',exact:true}).waitFor();
  await snapshot('production-desktop');
  await paper.getByRole('button',{name:'编辑项目经历',exact:true}).click();
  await paper.getByRole('textbox',{name:'简历区块标题',exact:true}).fill('项目实践与产出');
  await snapshot('production-inline');
  await paper.getByRole('button',{name:'保存标题',exact:true}).click();
  await saved();
  await page.reload({waitUntil:'domcontentloaded'});
  await paper.getByRole('heading',{name:'项目实践与产出',exact:true}).waitFor();
  assert.match((await readOwn()).resumeText,/项目实践与产出/);
  checks.push('Normal UI title edit, actual cloud receipt, refresh and same-account GET agree');
  console.log('QA: title save and refresh passed');
  await paper.getByRole('button',{name:/^编辑知识库整理工具/}).click();
  const field=paper.getByRole('textbox',{name:'简历段落正文',exact:true});
  const marker='失败重试验收：仅为虚构测试，不用于真实投递。';
  await field.fill((await field.inputValue())+'\n- '+marker);
  const patchPattern='**/api/coach/opportunities';
  const failOwn=route=>{
    const request=route.request();
    if(request.method()==='PATCH'&&request.postDataJSON()?.opportunity?.id===opportunityId)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'QA controlled save failure'})});
    return route.continue();
  };
  await page.route(patchPattern,failOwn);
  await paper.getByRole('button',{name:'保存这段文字',exact:true}).click();
  await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();
  assert.ok((await paper.locator('main').innerText()).includes(marker));
  assert.ok(!JSON.stringify(await readOwn()).includes(marker));
  await snapshot('production-save-failure');
  await page.unroute(patchPattern,failOwn);
  await page.getByRole('button',{name:'重试保存',exact:true}).click();
  await saved();
  await page.reload({waitUntil:'domcontentloaded'});
  await paper.getByText(marker,{exact:true}).waitFor();
  assert.ok(JSON.stringify(await readOwn()).includes(marker));
  checks.push('Only QA opportunity PATCH fails, unsynced text remains, cloud is unchanged until retry, refresh restores success');
  console.log('QA: controlled failure, retry and refresh passed');
  for(const template of ['classic','modern','warm']){
    await page.getByRole('button',{name:'简历更多选项',exact:true}).click();
    await page.getByLabel('简历版式',{exact:true}).selectOption(template);
    await page.getByRole('dialog',{name:'简历选项',exact:true}).press('Escape');
    await paper.locator('body.'+template).waitFor();
    if(template==='modern')await snapshot('production-modern');
    const opened=context.waitForEvent('page');
    await page.getByRole('button',{name:'导出 PDF',exact:true}).click();
    const preview=await opened;
    await preview.getByRole('button',{name:'保存为 PDF',exact:true}).waitFor();
    assert.equal(await preview.locator('.resume-edit,.resume-grip,.resume-live-editor,mark[data-ink]').count(),0);
    assert.ok((await preview.locator('main').innerText()).includes(marker));
    // Observe the app's actual print command before requesting the same Chrome
    // print engine's output. No second resume renderer or image-only PDF.
    await preview.evaluate(()=>{window.qaPrintEvents=0;window.addEventListener('beforeprint',()=>window.qaPrintEvents++);});
    await preview.getByRole('button',{name:'保存为 PDF',exact:true}).click();
    assert.equal(await preview.evaluate(()=>window.qaPrintEvents),1);
    await preview.pdf({path:join(output,'production-'+template+'.pdf'),preferCSSPageSize:true,printBackground:true});
    await preview.close();
  }
  checks.push('All three actual export windows print with Chrome, saved text and no editing controls');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'阅读视图',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await snapshot('production-mobile');
  assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
  checks.push('390px formal workspace fits; zero model calls and zero page errors');
  writeFileSync(join(output,'result.json'),JSON.stringify({passed:true,synthetic:true,cloud:true,checks,pageErrors:errors.length,modelCalls},null,2));
  console.log(JSON.stringify({passed:true,checks,output,pageErrors:errors.length,modelCalls},null,2));
}catch(error){
  await snapshot('production-failure').catch(()=>{});
  console.error(JSON.stringify({failed:true,error:String(error),checks,output}));throw error;
}finally{
  // Exact normal-API deletion of this run's own record; never a broad query.
  if(opportunityId){
    const removed=await context.request.delete(origin+'/api/coach/opportunities?id='+encodeURIComponent(opportunityId));
    assert.equal(removed.status(),200);
    console.log('QA: fictional workspace removed');
  }
  await context.request.post(origin+'/api/auth/logout').catch(()=>{});
  await browser.close();
}
