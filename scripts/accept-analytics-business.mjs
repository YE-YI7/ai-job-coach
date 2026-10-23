import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {samples} from '../public/eval-lab/samples.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),ts=require('typescript'),React=require('react');
const root=resolve(new URL('..',import.meta.url).pathname),origin=process.env.ANALYTICS_UI_BASE_URL||'http://127.0.0.1:3141';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Fictional replay is loopback-only');
const folder=process.env.ANALYTICS_UI_OUTPUT||join(root,'.artifacts/analytics-business-20261022');mkdirSync(folder,{recursive:true});
const fixtures=JSON.parse(readFileSync(process.env.ANALYTICS_FIXTURE_FILE||join(folder,'fixtures.json'),'utf8')),ids=fixtures.ids;
const checks=[],errors=[],requests=[];let failNext=false;
// Execute the actual server page with auth/navigation stubs: no token or DB.
const serverPage=readFileSync(join(root,'app/admin/evals/page.tsx'),'utf8'),serverModule={exports:{}};let signedIn=true;
const pageCode=ts.transpileModule(serverPage,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const runtime={jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k})};
vm.runInThisContext(`(function(require,module,exports){${pageCode}\n})`)(name=>name==='react/jsx-runtime'?runtime:name==='@/lib/auth'?{getCurrentUserFromRequest:async()=>signedIn?{id:ids.owner}:null}:name==='@/lib/coach-harness/eval-access'?{isEvalAdmin:()=>true}:name==='next/navigation'?{redirect:url=>{throw Error(`redirect:${url}`);}}:{default:()=>null,__esModule:true},serverModule,serverModule.exports);
const iframe=await serverModule.exports.default({searchParams:Promise.resolve({run:ids.run})});assert.match(iframe.props.src,new RegExp(`run=${ids.run}`));
signedIn=false;await assert.rejects(()=>serverModule.exports.default({searchParams:Promise.resolve({run:ids.run})}),e=>String(e).includes(encodeURIComponent(`?run=${ids.run}`)));signedIn=true;checks.push('Actual protected Eval wrapper forwards exact run and preserves it through login redirect');
const browser=await chromium.launch({channel:'chrome',headless:true});
let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.route('**/eval-lab/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1),allowed={'index.html':'text/html','app.mjs':'text/javascript','core.mjs':'text/javascript','samples.mjs':'text/javascript','styles.css':'text/css','outfit.woff2':'font/woff2'};if(!Object.hasOwn(allowed,name))return route.abort();return route.fulfill({contentType:allowed[name],body:readFileSync(join(root,'public/eval-lab',name))});});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());requests.push({path:url.pathname,query:url.search,method:request.method()});
  if(request.method()!=='GET')return route.fulfill({status:403,json:{error:'QA forbids writes'}});
  if(url.pathname==='/api/admin/analytics'){
   if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'虚构读取失败，不返回0'}});}
   const q=url.searchParams;
   if(q.get('view')==='material')return route.fulfill({json:{ok:true,material:fixtures.material}});
   if(q.get('view')==='sessions')return route.fulfill({json:{ok:true,sessions:q.get('full')==='1'?fixtures.full:q.get('session')?q.get('offset')==='20'?fixtures.messageNext:fixtures.selected:fixtures.detail}});
   const data=q.get('from')==='2026-10-21'?fixtures.prior:q.get('feature')?fixtures.feature:q.get('offset')==='20'?fixtures.second:fixtures.first;
   return route.fulfill({json:{ok:true,dataset:data}});
  }
  if(url.pathname==='/api/admin/eval-runs'){
   if(url.searchParams.get('id')===ids.run){const run=structuredClone(samples.runs[0]);run.id=ids.run;run.label='虚构历史运行（不在最近20条）';return route.fulfill({json:{schemaVersion:'yizhi.eval/v1',runs:[run]}});}
   if(url.searchParams.has('id'))return route.fulfill({status:404,json:{error:'记录不存在'}});
   return route.fulfill({json:{captured:[{id:ids.other,label:'另一条虚构运行',created_at:'2026-10-22T09:00:00Z',status:'completed'}],traces:[]}});
  }
  return route.fulfill({json:{ok:true,rows:[],feedback:[],experiments:[]}});
 });
 await page.route('**/admin/evals?run=*',async route=>{const run=new URL(route.request().url()).searchParams.get('run');const component=await serverModule.exports.default({searchParams:Promise.resolve({run})});await route.fulfill({contentType:'text/html',body:`<!doctype html><title>Protected wrapper fixture</title><iframe title="益职 Eval Lab 管理员工作台" style="width:100%;height:100vh;border:0" src="${component.props.src}"></iframe>`});});
 await page.goto(`${origin}/tools/qa-analytics-fixture?view=daily&from=2026-10-22&to=2026-10-22`);await page.getByRole('table').first().waitFor();
 await page.getByLabel('开始日期',{exact:true}).fill('2026-10-21');await page.getByLabel('结束日期',{exact:true}).fill('2026-10-21');await page.getByRole('button',{name:'应用筛选',exact:true}).click();await page.waitForURL(/from=2026-10-21/);await page.getByRole('table').first().waitFor();assert.match(await page.locator('tbody').first().innerText(),/24/);checks.push('Arbitrary calendar dates change all selected-day data');
 await page.getByLabel('开始日期',{exact:true}).fill('2026-10-22');await page.getByLabel('结束日期',{exact:true}).fill('2026-10-22');await page.getByRole('button',{name:'应用筛选',exact:true}).click();await page.getByRole('table').first().waitFor();await page.screenshot({path:join(folder,'desktop-daily.png'),fullPage:true});
 await page.getByRole('button',{name:'按用户',exact:true}).click();await page.getByRole('table').first().waitFor();assert.equal(await page.locator('tbody tr').count(),20);
 await page.getByRole('navigation',{name:'用户分页'}).getByRole('button',{name:'下一页',exact:true}).click();await page.waitForURL(/offset=20/);await page.getByRole('table').waitFor();assert.equal(await page.locator('tbody tr').count(),5);await page.reload();await page.getByRole('table').waitFor();assert.equal(await page.locator('tbody tr').count(),5);assert.match(page.url(),/asOf=/);checks.push('25 users paginate as 20+5; reload retains date, page and frozen asOf');
 await page.getByText('更多筛选',{exact:false}).click();await page.getByRole('checkbox',{name:'简历',exact:true}).check();await page.getByRole('button',{name:'应用筛选',exact:true}).click();await page.getByRole('table').waitFor();assert.equal(await page.locator('tbody tr').count(),1);checks.push('Human-readable feature filter applies and clears the prior page offset');
 await page.getByRole('button',{name:ids.user,exact:true}).click();await page.getByRole('heading',{name:ids.user,exact:true}).waitFor();await page.getByRole('button',{name:/^导师对话/}).click();await page.getByRole('region',{name:'会话正文'}).getByText('虚构问题 0，请讨论这段经历',{exact:true}).waitFor();assert.equal(await page.locator('article strong').filter({hasText:'虚构回复 0'}).count(),1);assert.doesNotMatch(await page.getByRole('region',{name:'会话正文'}).innerText(),/\*\*/);
 await page.getByRole('navigation',{name:'消息分页'}).getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('虚构问题 10，请讨论这段经历',{exact:true}).waitFor();await page.reload();await page.getByText('虚构问题 10，请讨论这段经历',{exact:true}).waitFor();checks.push('User -> session -> messages supports ordered bubbles, Markdown, message pagination and refresh');
 await page.getByRole('button',{name:'查看完整会话',exact:true}).click();await page.getByText('完整会话（跨日期）',{exact:true}).waitFor();checks.push('Explicit cross-date full session toggle works');
 await page.getByRole('button',{name:'简历',exact:true}).click();await page.getByLabel('关联岗位／材料').selectOption(ids.job);await page.getByRole('heading',{name:'当前工作稿',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/核对问题清单并整理需求记录/);await page.screenshot({path:join(folder,'desktop-user-detail.png'),fullPage:true});
 await page.getByRole('button',{name:'JD／岗位',exact:true}).click();await page.getByRole('heading',{name:'当前 JD',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/虚构 JD/);
 await page.getByRole('button',{name:'面试',exact:true}).click();await page.getByRole('heading',{name:'真实面试复盘',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/虚构真实面试记录/);checks.push('Owned current resume, applied draft, JD, mock interview and review are inspectable without invented historical versions');
 await page.getByRole('button',{name:'Eval／Trace',exact:true}).click();await page.getByRole('link',{name:'打开这条完整 Eval／Trace'}).click();const frame=page.frameLocator('iframe');await frame.getByText('虚构历史运行（不在最近20条）',{exact:true}).first().waitFor();assert.ok(requests.some(r=>r.path==='/api/admin/eval-runs'&&r.query.includes(`id=${ids.run}`)));await page.reload();await frame.getByText('虚构历史运行（不在最近20条）',{exact:true}).first().waitFor();checks.push('Exact historical Trace link survives outer iframe, bounded recent list, API lookup and refresh');
 await page.goBack();await page.getByRole('heading',{name:ids.user,exact:true}).waitFor();await page.getByRole('button',{name:'GEO 研究',exact:true}).click();await page.getByRole('heading',{name:'暂不自动运行'}).waitFor();assert.equal(await page.getByRole('heading',{name:ids.user,exact:true}).count(),0);assert.equal(await page.locator('article').count(),0);checks.push('GEO never retains previous private session content and invokes no models');
 await page.getByRole('button',{name:'基础数据',exact:true}).click();await page.getByRole('table').first().waitFor();failNext=true;await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.getByRole('alert').filter({hasText:'虚构读取失败'}).waitFor();assert.equal(await page.getByRole('table').count(),0);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.getByRole('table').first().waitFor();assert.equal(await page.getByRole('alert').filter({hasText:'虚构读取失败'}).count(),0);checks.push('503 hides stale data; explicit retry restores data and clears the error');
 await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('table').first().waitFor();assert.equal(await page.locator('aside').count(),1);assert.equal(await page.locator('main').count(),1);await page.screenshot({path:join(folder,'mobile-daily.png'),fullPage:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('390px viewport keeps table scrolling local and has no document-wide horizontal overflow');
 assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>r.path.startsWith('/api/admin/')).every(r=>r.method==='GET'));writeFileSync(join(folder,'browser-results.json'),JSON.stringify({fixtureOnly:true,checks,requests,errors,nonGetRequestsBlocked:true},null,2));console.log(JSON.stringify({fixtureOnly:true,passed:checks.length,checks,output:folder},null,2));
}catch(error){if(page){writeFileSync(join(folder,'failure.txt'),await page.locator('body').innerText());await page.screenshot({path:join(folder,'failure.png'),fullPage:true});}console.error(JSON.stringify({checks,errors,requestTail:requests.slice(-5)}));throw error;}finally{await browser.close();}
