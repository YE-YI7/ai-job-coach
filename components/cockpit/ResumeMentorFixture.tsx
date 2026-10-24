"use client";
import {useState} from 'react';
import type {ChatMode} from '@/lib/coach-harness/chat-options';
import {catalogWithAvailability} from '@/lib/coach-harness/model-catalog';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';
import ResumeAgentConversation from './ResumeAgentConversation';
import ResumeComposerModel from './ResumeComposerModel';
import ModelPicker from './ModelPicker';

const task:ResumeAgentTask={
 id:'fictional-model-control',state:'ready',question:null,answers:[],updatedAt:'2026-10-24T00:00:00Z',
 conversation:[{id:'fixture-turn',message:'我交付了一份需求说明。',reply:'这份说明后来由谁使用？',
  status:'completed',decision:'discuss',savedAt:'2026-10-24T00:00:00Z'}],
};
const catalog=catalogWithAvailability(['glm-5.3']);
const noop=async()=>{};
export default function ResumeMentorFixture(){
 const [mode,setMode]=useState<ChatMode>('auto');
 return <section style={{maxWidth:390,height:'85dvh',margin:'24px auto',display:'flex',flexDirection:'column'}}>
  <p>虚构 UI 验收 · 不调用模型，不写业务资料</p>
  <ResumeComposerModel.Provider value={{mode,control:<ModelPicker value={mode} onChange={setMode} catalog={catalog} connected/>}}>
   <ResumeAgentConversation task={task} busy={false} onMessage={noop} onContinue={noop} onSkip={noop}/>
  </ResumeComposerModel.Provider>
  <output aria-label="当前验收模型">{mode}</output>
 </section>;
}
