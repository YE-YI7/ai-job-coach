'use client';

import {useEffect, useState} from 'react';
import {CockpitApp} from './CockpitApp';
import {demoOpportunities} from '@/lib/opportunities/demo';
import type {Opportunity} from '@/lib/opportunities/types';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';
import {classifyResumeDelivery} from '@/lib/coach-harness/resume-delivery';

const source='林验收（虚构）\n\n## 项目经历\n### 客服知识助手\n- 收集客服反馈，整理问题并交给产品经理。';
const initial:Opportunity={...demoOpportunities[0],id:'11111111-1111-4111-8111-111111111119',company:'虚构慢读取验收',
  role:'产品经理',resumeText:source,resumeRevision:'fixture-revision',resumeOriginal:undefined,applicationQuality:undefined,
  resumeGenerationId:'fixture:1',resumeChanges:[{id:'old',section:'项目',before:source,
    after:source.replace('收集客服反馈','上轮：收集客服反馈'),reason:'旧建议',status:'accepted',evidenceId:'fixture-evidence'}]};

/** Development-only UI transport fixture. Every API request is local and mocked;
 * the real toolbar, confirm dialog, CockpitApp action and receipt handling run. */
export default function ResumeRestartFixture({replay=false}:{replay?:boolean}){
  const [ready,setReady]=useState(false);
  const [calls,setCalls]=useState<string[]>([]);
  useEffect(()=>{
    if(process.env.NODE_ENV!=='development')return;
    const original=window.fetch;
    let generation=1;
    let task:ResumeAgentTask={id:'fixture',state:'ready',answers:[],question:null,updatedAt:'2026-11-09T00:00:00Z',
      result:{changes:initial.resumeChanges,resumeGenerationId:'fixture:1'}};
    const reads:Array<(response:Response)=>void>=[];
    const json=(value:unknown)=>Response.json(value);
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
      if(!url.pathname.startsWith('/api/'))return original(input,init);
      if(url.pathname==='/api/coach/resume-agent'){
        if(init?.method==='POST'){
          const body=JSON.parse(String(init.body));
          setCalls(previous=>[...previous,body.action]);
          if(body.action!=='restart'||replay)return json({ok:true,task,replayed:true});
          generation++;
          task={...task,state:'running'};
          reads.splice(0).forEach(resolve=>resolve(json({ok:true,task})));
          await new Promise(resolve=>setTimeout(resolve,800));
          task={...task,state:'ready',updatedAt:new Date().toISOString(),result:{resumeGenerationId:`fixture:${generation}`,
            changes:[{...initial.resumeChanges[0],id:`new-${generation}`,status:'pending',
              after:source.replace('收集客服反馈，整理问题并交给产品经理。',`本轮新稿 ${generation}：分类客服反馈，记录问题和来源，交给产品经理核对。`)}]},
            delivery:classifyResumeDelivery({generationId:`fixture:${generation}`,taskState:'ready',persisted:true,newChangeCount:1})};
          return json({ok:true,task});
        }
        if(generation===1)return new Promise<Response>(resolve=>reads.push(resolve));
        return json({ok:true,task});
      }
      if(url.pathname==='/api/coach/opportunities')return json({ok:true,opportunities:[initial]});
      if(url.pathname==='/api/payments/watcha/wallet')return json({ok:true,balance:0,account:{configured:false}});
      return json({ok:true,connected:false,models:[],sessions:[],runs:[],data:[],remaining:10});
    };
    setReady(true);
    return()=>{window.fetch=original;reads.splice(0).forEach(resolve=>resolve(json({ok:true,task:null})));};
  },[replay]);
  if(process.env.NODE_ENV!=='development')return null;
  return <>
    <p role="status">虚构慢读取验收 · 所有接口为本地替身 · 模型费 0 · 已发改稿动作：{calls.join('、')||'无'}
      {replay?' · 旧结果回放场景':''}</p>
    {ready&&<CockpitApp initialOpportunities={[initial]} userId="fictional-restart-user" userEmail="qa@example.test"
      dataMode="live" initialTab="resume"/>}
  </>;
}
