import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {get} from 'node:http';
import {traceStory,compactNodes,orderedRows,selectionAfterRefresh,escape} from '../public/eval-lab/brief-model.mjs';
import {sidecar} from './eval-trace-sidecar.mjs';
test('HR-only record cannot pretend author, Memory, search or persistence executed',() => {
  const story = traceStory({spans:[{id:'h',agent:'原独立HR',input:{messages:[]},output:'点评'}]});
  assert.deepEqual(story.nodes.map(n => n.type),['input','hr','delivery']);
  assert.match(story.nodes.at(-1).summary,/没有重写、保存或导出/);
  assert.equal(story.tools.length,0);
  assert.equal(story.nodes[1].decisionRecorded,false);
});
test('production independent quality-review span is HR, not another author',() => {
  const story=traceStory({spans:[{name:'独立质检 Agent',agent:'独立质检 Agent',kind:'agent',output:'real HR commentary'}]});
  assert.deepEqual(story.nodes.map(node=>node.type),['input','hr','delivery']);
  assert.equal(story.isHrOnly,true);
});
test('failed write and pre-HR corrections cannot be shown as HR revisions',() => {
  const nodes=compactNodes([
    {id:'a1',type:'author'},{type:'tool',title:'写出正文与说明',status:'failed',files:[{name:'resume-new.md',text:'rejected'}]},
    {id:'a2',type:'author'},{type:'tool',title:'写出正文与说明',status:'recorded',files:[{name:'resume-new.md',text:'first body'}]},
    {id:'h',type:'hr'},{id:'a3',type:'author'},
    {type:'tool',title:'写出正文与说明',status:'recorded',files:[{name:'resume-new.md',text:'after HR'}]},
  ]);
  assert.deepEqual(nodes.map(node=>node.title),['工具调用未完成','形成首稿',undefined,'根据点评返修']);
});
test('saved false is a failed receipt, not a successful candidate write',() => {
  const story=traceStory({spans:[{id:'a',kind:'agent',output:JSON.stringify({tool_calls:[{id:'t',function:{name:'write_output',
    arguments:JSON.stringify({files:[{name:'resume-new.md',text:'rejected'}]})}}]})},
    {kind:'stage',input:{toolCallId:'t'},output:{saved:false,issues:['identity changed']}}]});
  const tool=story.nodes.find(node=>node.type==='tool');assert.equal(tool.status,'failed');
  assert.match(tool.note,/未保存/);assert.equal(compactNodes(story.nodes).find(node=>node.id==='a').title,'工具调用未完成');
});
test('actual F6 source-protection receipt saved empty and applied false is not a first draft',() => {
  const story=traceStory({spans:[{id:'a',kind:'agent',output:JSON.stringify({tool_calls:[{id:'t',function:{name:'write_output',
    arguments:JSON.stringify({files:[{name:'resume-new.md',text:'identity changed'}]})}}]})},
    {kind:'stage',input:{toolCallId:'t'},output:{saved:[],applied:false,issues:['identity changed']}}]});
  assert.equal(story.nodes.find(node=>node.type==='tool').status,'failed');
  assert.equal(compactNodes(story.nodes).find(node=>node.id==='a').title,'工具调用未完成');
});
test('native tools and actual receipt are linked, not inferred to be adopted',() => {
  const story = traceStory({spans:[{id:'a',kind:'agent',output:JSON.stringify({tool_calls:[
    {id:'t',function:{name:'read_file',arguments:'{"file":"facts.md"}'}}]})},
    {kind:'stage',input:{toolCallId:'t'},output:{text:'actual facts'}}]});
  const tool = story.nodes.find(n => n.type === 'tool');
  assert.equal(tool.summary,'已有经历事实');
  assert.deepEqual(tool.detail.receipt,{text:'actual facts'});
  assert.match(tool.note,/不等于用进/);
});
test('Judge and human assessment stay outside actual author timeline',() => {
  const story = traceStory({spans:[{agent:'LLM 自评',output:'great'},{agent:'作者',output:'draft'}],
    manualSourceAudit:{verdict:'bad'}});
  assert.equal(story.judge.length,1);
  assert.equal(story.nodes.filter(n => n.type === 'author').length,1);
  assert.equal(story.human.verdict,'bad');
});
test('F6 write_output files stay independently readable, without replacing them with a Judge',() => {
  const story = traceStory({spans:[{id:'a',output:JSON.stringify({tool_calls:[{function:{
    name:'write_output',arguments:JSON.stringify({files:[{name:'resume-new.md',text:'real draft'},
      {name:'notes.md',text:'actual selection'},{name:'mentor.md',text:'real question'}]})}}]})}]});
  assert.equal(story.nodes.find(node => node.type === 'tool').files.length,3);
  assert.equal(story.nodes.find(node => node.type === 'tool').files[0].text,'real draft');
});
test('newest order is chronological; explicit historical selection stays pinned',() => {
  const rows = orderedRows({captured:[{id:'old',created_at:'2026-01-01'},
    {id:'new',created_at:'2026-02-01'}]});
  assert.equal(rows[0].id,'new');
  assert.equal(selectionAfterRefresh(rows,null,null),'new');
  assert.equal(selectionAfterRefresh(rows,'old',null),'old');
  assert.equal(selectionAfterRefresh(rows,null,'outside-latest-30'),'outside-latest-30');
  assert.equal(selectionAfterRefresh(rows,'old',null,true),'new');
  assert.equal(selectionAfterRefresh([], 'old',null,true),'old');
});
test('escape untrusted labels and outputs',() => {
  assert.equal(escape('<img onerror="oops">'), '&lt;img onerror=&quot;oops&quot;&gt;');
});
test('local mirror refuses writes, rebinding and arbitrary file reads',async () => {
  const server = sidecar([]); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url+'/api/admin/eval-runs',{method:'POST'})).status,405);
    const forbidden = await new Promise(resolve => get(url+'/',{headers:{Host:'attacker.invalid'}},
      response => { response.resume(); resolve(response.statusCode); }));
    assert.equal(forbidden,403);
    assert.equal((await fetch(url+'/etc/passwd')).status,404);
    assert.equal((await fetch(url+'/eval-lab/brief.html')).status,200);
    const empty = await (await fetch(url+'/api/admin/eval-runs')).json();
    assert.deepEqual(empty.captured,[]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('viewer has no model/DB write actions and fetches fresh data',() => {
  const source = readFileSync(new URL('../public/eval-lab/brief.mjs',import.meta.url),'utf8');
  assert.match(source,/cache:'no-store'/);
  assert.match(source,/15000/);
  assert.match(source,/visibilitychange/);
  assert.doesNotMatch(source,/method:\s*['"]POST|localStorage|sessionStorage/);
});
