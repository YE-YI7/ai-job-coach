// Isolated DOM port tests for asynchronous state, not browser acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function harness() {
  const elements=new Map(),storage=new Map(),requests=[];
  function element(id) {
    if(!elements.has(id)) {
      let html='';
      const e={value:'',textContent:'',disabled:false,options:[],className:'',hidden:false};
      Object.defineProperty(e,'innerHTML',{get:()=>html,set:value=>{html=value;e.options=[...value.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));if(e.options.length)e.value=e.options[0].value;}});
      elements.set(id,e);
    }
    return elements.get(id);
  }
  const source=readFileSync(new URL('../public/eval-lab/app.mjs',import.meta.url),'utf8')
    .replace(/^import[\s\S]*?from "\.\/core.mjs";\n/,'').replace(/^import .*?;\n/gm,'')
    .replace(/\bexport /g,'').replace(/if \(typeof document !== "undefined"\) boot\(\);/,'');
  const api=new Function('document','sessionStorage','crypto','fetch','setTimeout','clearTimeout',source+`
    return { saveFeedback, loadFeedback, captureDraft, renderFeedback,
      visit(id){runs=[{id,provenance:'production',result:{}}];loadedSource='production';selected=id;resetFeedback(id);renderFeedback();},
      state(){return {draft:feedbackDraft,busy:feedbackBusy,status:feedbackStatus,items:feedbacks};} };
  `)({getElementById:element},{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},webcrypto,
    (url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),()=>0,()=>{});
  const respond=(i,body,status=200)=>requests[i].resolve({status,ok:status>=200&&status<300,json:async()=>body});
  const note=(value)=>{element('fb-note').value=value;api.captureDraft();};
  return {api,element,requests,respond,note};
}
test('late save success cannot clear or label a different run; returning restores its own draft',async()=>{
  const h=harness();h.api.visit(idA);h.note('A issue');const saved=h.api.saveFeedback();
  const body=JSON.parse(h.requests[0].options.body);h.api.visit(idB);
  assert.equal(h.element('fb-note').value,'');h.note('B issue');
  h.respond(0,{ok:true,feedback:{...body,createdAt:new Date().toISOString()}});await saved;
  assert.equal(h.element('fb-note').value,'B issue');assert.equal(h.api.state().items.length,0);
  h.api.visit(idA);assert.equal(h.element('fb-note').value,'');h.api.visit(idB);assert.equal(h.element('fb-note').value,'B issue');
});
test('late save failure does not touch the new run or throw on its null draft',async()=>{
  const h=harness();h.api.visit(idA);h.note('A issue');const saved=h.api.saveFeedback();h.api.visit(idB);
  h.requests[0].reject(Error('offline'));await saved;assert.equal(h.api.state().status,null);assert.equal(h.api.state().busy,false);
  h.api.visit(idA);assert.equal(h.element('fb-note').value,'A issue');assert.ok(h.api.state().draft.pending);
});
test('uncertain network failure freezes exact body/UUID; refresh and retry cannot create duplicate feedback',async()=>{
  const h=harness();h.api.visit(idA);h.note('original issue');const first=h.api.saveFeedback();
  const payload=h.requests[0].options.body;h.requests[0].reject(Error('offline'));await first;
  h.api.visit(idA);assert.equal(h.element('fb-note').disabled,true);assert.equal(h.element('fb-save').textContent,'确认上次提交');
  h.element('fb-note').value='not the submitted body';h.api.captureDraft();const retry=h.api.saveFeedback();
  assert.equal(h.requests[1].options.body,payload);h.respond(1,{ok:true,replayed:true,feedback:{...JSON.parse(payload),createdAt:new Date().toISOString()}});await retry;
  assert.equal(h.api.state().draft,null);assert.equal(h.element('fb-note').disabled,false);
});
test('mismatched server receipt is not shown as saved; definitive rejection keeps editable input',async()=>{
  const h=harness();h.api.visit(idA);h.note('issue');const first=h.api.saveFeedback();h.respond(0,{ok:true,feedback:{id:'wrong',runId:idB}});await first;
  assert.ok(h.api.state().draft.pending);assert.match(h.api.state().status,/编号不一致/);
  const retry=h.api.saveFeedback();h.respond(1,{ok:false,error:'修改不存在'},400);await retry;
  assert.equal(h.api.state().draft.pending,undefined);assert.equal(h.element('fb-note').value,'issue');assert.equal(h.element('fb-note').disabled,false);
});
test('a list read issued before save cannot overwrite the newly confirmed record',async()=>{
  const h=harness();h.api.visit(idA);const reading=h.api.loadFeedback(idA);h.note('issue');const saved=h.api.saveFeedback();
  const payload=JSON.parse(h.requests[1].options.body);h.respond(1,{ok:true,feedback:{...payload,createdAt:new Date().toISOString()}});await saved;
  h.respond(0,{ok:true,cases:[]});await reading;assert.equal(h.api.state().items[0].id,payload.id);
});
test('confirmed save clears an earlier list error instead of keeping a stale failure message',async()=>{
  const h=harness();h.api.visit(idA);const reading=h.api.loadFeedback(idA);h.respond(0,{ok:false,error:'temporary'},503);await reading;
  h.note('issue');const saved=h.api.saveFeedback();const body=JSON.parse(h.requests[1].options.body);h.respond(1,{ok:true,feedback:{...body,createdAt:new Date().toISOString()}});await saved;
  assert.match(h.element('fb-status').textContent,/后台已保存/);assert.doesNotMatch(h.element('fb-status').textContent,/temporary/);
});
