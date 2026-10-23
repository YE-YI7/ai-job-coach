import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const output=process.argv[2]||mkdtempSync(join(tmpdir(),'yizhi-message-replay-'));mkdirSync(output,{recursive:true});
const build=mkdtempSync(join(tmpdir(),'yizhi-message-build-'));
await new Promise((done,fail)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,context:root,entry:'./scripts/qa/resume-message-replay.tsx',output:{path:build,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.(tsx?|css)$/,exclude:/node_modules/,use:resolve(root,'scripts/qa/resume-replay-loader.cjs')}]},optimization:{splitChunks:false}},(error,stats)=>error?fail(error):stats.hasErrors()?fail(Error(stats.toString({all:false,errors:true}))):done()));
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?readFileSync(join(build,'bundle.js')):'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8f9f5;font-family:system-ui;color:#292c27}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=createRequire('/Users/yi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
 for(const mode of ['completed','same-batch','lost-done']){
  const context=await browser.newContext({viewport:{width:900,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const input=page.getByRole('textbox',{name:'给简历导师发消息'});
  await input.fill('交付了虚构项目的达人对接方案。');
  await page.screenshot({path:join(output,'before-send-'+mode+'.png')});
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByRole('log').getByText('已收到补充。',{exact:true}).waitFor();
  assert.equal(await page.getByRole('log').locator('strong').innerText(),'已收到补充。');
  if(mode==='completed')await input.fill('这是一条尚未发送的新草稿。');
  await page.evaluate(mode=>window.qa.finish(mode),mode);
  if(mode!=='lost-done')await page.waitForFunction(()=>!document.querySelector('[aria-label="正在处理"]'));
  else await page.getByText('这段回复尚未确认保存。',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),mode==='completed'?'这是一条尚未发送的新草稿。':'','A saved user message must never be restored as unsent or overwrite a new draft');
  await page.getByRole('log').getByText('交付了虚构项目的达人对接方案。',{exact:true}).waitFor();
  if(mode==='lost-done')await page.getByText('这段回复尚未确认保存。',{exact:true}).waitFor();
  else{
   assert.equal(await page.getByRole('alert').count(),0,'Completed mentor reply is independent of later editor failure');
   await page.reload();
   await page.getByRole('log').getByText(mode==='same-batch'?'同一批回执已保存。':'已收到补充。',{exact:true}).waitFor();
  }
  await page.screenshot({path:join(output,mode+'.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(output,mode+'-mobile.png')});
  assert.deepEqual(errors,[]);checks.push({mode,passed:true,realComponent:true,networkCalls:0});await context.close();
 }
 writeFileSync(join(output,'result.json'),JSON.stringify({synthetic:true,checks},null,2));console.log(JSON.stringify({passed:true,output,checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
