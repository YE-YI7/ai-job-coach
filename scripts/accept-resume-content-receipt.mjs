import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const [dir,origin]=process.argv.slice(2);
assert.ok(dir&&(origin==='https://yizhioffer.com'||/^https:\/\/ai-job-coach-[a-z0-9]+-velmavalienteqejimu22-jpgs-projects\.vercel\.app$/.test(origin)));
const q=JSON.parse(readFileSync(join(dir,'private.json'),'utf8'));
const {chromium}=createRequire('/Users/yi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const output=join(dir,'evidence','conversation');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({storageState:join(dir,'session.json'),viewport:{width:1512,height:982}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await context.addInitScript(()=>{
  const fetch=window.fetch;
  window.fetch=async(...args)=>{
   const response=await fetch(...args);
   if(String(args[0]).includes('/api/coach/resume-agent')&&args[1]?.method==='POST'&&JSON.parse(String(args[1].body||'{}')).action==='message'){
    void response.clone().text().then(body=>{window.qaResumeResponse={status:response.status,body};});
   }
   return response;
  };
 });
 await context.addInitScript(({owner,id})=>{if(!sessionStorage.getItem('qa-selected-workspace')){localStorage.setItem('yizhi:workspace-view:v1:'+owner,JSON.stringify({opportunityId:id,tab:'resume'}));sessionStorage.setItem('qa-selected-workspace','yes');}},{owner:q.id,id:q.opportunityIds[1]});
 await page.goto(origin+'/cockpit',{waitUntil:'domcontentloaded'});
 const input=page.getByRole('textbox',{name:'给简历导师发消息'});
 await input.waitFor({timeout:45000});
 const before=await(await context.request.get(origin+'/api/coach/resume-agent?opportunityId='+q.opportunityIds[1])).json();
 if(['readback','formal'].includes(process.argv[4])){
  if(process.argv[4]==='formal'){
   const expected=JSON.parse(readFileSync(join(evidencePath(),'model-1.json'),'utf8')).task;
   assert.equal(before.task.state,'ready');assert.equal(before.task.result.resumeGenerationId,expected.result.resumeGenerationId);
   const jobs=await(await context.request.get(origin+'/api/coach/opportunities')).json();
   assert.ok(jobs.opportunities.find(o=>o.id===q.opportunityIds[1]).resumeChanges.some(c=>c.status==='accepted'));
  }
  const latest=before.task.conversation.at(-1);assert.equal(latest.status,'completed');assert.ok(latest.reply);
  const draft='这是一条暂未发送的新草稿，不要覆盖。';await input.fill(draft);await page.reload({waitUntil:'domcontentloaded'});
  await input.waitFor({timeout:45000});assert.equal(await input.inputValue(),draft);
  const after=await(await context.request.get(origin+'/api/coach/resume-agent?opportunityId='+q.opportunityIds[1])).json();
  assert.deepEqual(after.task.conversation,before.task.conversation);
  await page.getByRole('log',{name:'简历讨论'}).getByText(latest.message,{exact:true}).last().waitFor();
  assert.equal(await page.getByRole('log').getByText('重新发送',{exact:true}).count(),0);assert.deepEqual(errors,[]);
  await page.screenshot({path:join(output,'reply-refreshed.png')});
  const result={passed:true,synthetic:true,modelCalls:0,turnId:latest.id,generationId:after.task.result?.resumeGenerationId,conversationSurvivesRefresh:true,newDraftSurvives:true,noFailedSend:true,...(process.argv[4]==='formal'?{formalVerified:true}:{} )};
  writeFileSync(join(output,process.argv[4]==='formal'?'formal.json':'readback.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }else{
 const message='我还参与过一次达人对接：交付了各位达人的对接方案，分析了各个达人的特点，并针对特点定制方案。';
 await input.fill(message);
 const started=Date.now();await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByRole('log',{name:'简历讨论'}).getByText(message,{exact:true}).waitFor();
 const draft='这是一条暂未发送的新草稿，不要覆盖。';await input.fill(draft);
 await page.waitForFunction(()=>window.qaResumeResponse,undefined,{timeout:120000});
 const response=await page.evaluate(()=>window.qaResumeResponse),body=response.body;assert.equal(response.status,200);
 const events=body.trim().split('\n').map(line=>JSON.parse(line)),done=events.at(-1);
 writeFileSync(join(output,'actual-response.json'),JSON.stringify({synthetic:true,input:message,durationMs:Date.now()-started,events},null,2));
 assert.equal(done.ok,true);assert.equal(done.conversationDecision,'discuss','Unknown experience placement must be discussed, not appended to a guessed employment entry');
 assert.ok(events.some(e=>e.type==='receipt'&&e.task?.conversation?.some(t=>t.status==='pending'&&t.message===message)));
 const turn=done.task.conversation.find(t=>t.message===message);assert.equal(turn.status,'completed');assert.ok(turn.reply);
 assert.equal(await input.inputValue(),draft);
 const after=await(await context.request.get(origin+'/api/coach/resume-agent?opportunityId='+q.opportunityIds[1])).json();
 assert.equal(after.task.result?.resumeGenerationId,before.task.result?.resumeGenerationId);assert.deepEqual(after.task.result?.changes,before.task.result?.changes);
 await page.screenshot({path:join(output,'reply-saved.png')});await page.reload({waitUntil:'domcontentloaded'});
 await input.waitFor({timeout:45000});assert.equal(await input.inputValue(),draft);
 const refreshed=await(await context.request.get(origin+'/api/coach/resume-agent?opportunityId='+q.opportunityIds[1])).json();
 assert.deepEqual(refreshed.task.conversation,after.task.conversation);
 await page.getByRole('log',{name:'简历讨论'}).getByText(message,{exact:true}).waitFor();
 assert.equal(await page.getByRole('log').getByText('重新发送',{exact:true}).count(),0);
 await page.screenshot({path:join(output,'reply-refreshed.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,synthetic:true,decision:done.conversationDecision,turnId:turn.id,receiptCount:events.filter(e=>e.type==='receipt').length,newDraftSurvives:true,conversationSurvivesRefresh:true,noResumeRewrite:true,durationMs:Date.now()-started}));
 }
}finally{await browser.close();}
function evidencePath(){return join(dir,'evidence');}
