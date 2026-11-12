import {F6ToolSession, F6_ORIGIN_TOOLS} from './f6-tool-session';
import origin from './f6-origin.json';
import {createHash} from 'node:crypto';
import {f6RuntimeIdentity} from './f6-runtime-contract';

/** Admin-only, zero LLM, fictional input. Exercise deployed services, not mocks. */
export async function verifyDeployedF6Runtime() {
  const session = new F6ToolSession({resume:'### 虚构工具验收\n- 整理记录并制作分类表，交付同事核对。',
    jd:'Manus Agent product manager', facts:[], company:'Manus', domain:'manus.im'},()=>[],
    undefined,undefined,undefined,true);
  const productTools=session.availableTools();
  const reads=[];
  for(const id of Object.keys(session.resources)) {
    const result=await session.invoke('read_file',{file:id});
    reads.push({id,sha256:createHash('sha256').update(String(result.text)).digest('hex')});
  }
  // The deployed product permits a direct public read before any search.
  // Keep this probe on the same contract, not the frozen experiment adapter.
  const fetched=await session.invoke('fetch',{urls:['https://www.anthropic.com/engineering/writing-tools-for-agents']});
  const search=await session.invoke('search',{query:'Agent product manager evaluation ownership evidence'}) as {results:Array<{url:string}>};
  if(!search.results.length)throw Error('REAL_SEARCH_EMPTY');
  await session.invoke('write_output',{files:['portrait.md','battle.md','resume-new.md','changes.md','notes.md']
    .map(name=>({name,text:name==='resume-new.md'?session.resources['resume.md']:'虚构工具接线验收'}))});
  const pdf=await session.invoke('render_pdf',{});
  return {modelCalls:0,writerContract:f6RuntimeIdentity(),originSystemHash:origin.systemHash,
    tools:productTools,originTools:F6_ORIGIN_TOOLS,reads,search,fetched,
    outputs:Object.keys(session.deliverables().files),pdf,pdfEvidence:session.deliverables().pdf?.receipt};
}
