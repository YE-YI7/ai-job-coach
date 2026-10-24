"use client";
import {useState} from 'react';
import ResumeToolbar from './ResumeToolbar';
import CompanionStart from './CompanionStart';
export default function ExperienceSafetyFixture(){
  const [runs,setRuns]=useState(0);
  return <main style={{maxWidth:860,margin:'24px auto',padding:20,color:'#2f2a23'}}>
    <p>虚构交互验收 · 不写云端，不调用模型</p>
    <ResumeToolbar busy={false} canGenerate needsDetail={false} hasChanges={false} pendingCount={0}
      fee="虚构验收，不计费" canUndo={false} canRedo={false} onGenerate={()=>setRuns(n=>n+1)}
      onUndo={()=>{}} onRedo={()=>{}} showMarks onShowMarks={()=>{}} showOriginal={false}
      onShowOriginal={()=>{}} template="classic" onTemplate={()=>{}} exportControl={null}/>
    <output aria-label="任务启动次数">任务启动次数：{runs}</output>
    <CompanionStart fixture scope="experience-fixture" onResume={()=>{}} onInterview={()=>{}}/>
  </main>;
}
