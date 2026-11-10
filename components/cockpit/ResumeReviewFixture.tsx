'use client';
import {useState, useSyncExternalStore} from 'react';
import ResumeInlineReview from './ResumeInlineReview';
import ResumeAgentConversation from './ResumeAgentConversation';
import ResumeComposerModel from './ResumeComposerModel';
import ModelPicker from './ModelPicker';
import {catalogWithAvailability} from '@/lib/coach-harness/model-catalog';
import type {ChatMode} from '@/lib/coach-harness/chat-options';
import {demoOpportunities} from '@/lib/opportunities/demo';
import {decideResumeChanges} from '@/lib/opportunities/resume-agent-merge';
import {rememberResumeEdit,travelResumeEdit} from '@/lib/opportunities/resume-edit-history';
import type {Opportunity} from '@/lib/opportunities/types';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';
import styles from './ResumeReferenceFixture.module.css';

const source='林验收（虚构）\n邮箱 qa@example.test\n\n## 项目经历\n'+Array.from({length:18},(_,i)=>
  `### 项目 ${i+1}\n- 整理需求与用户反馈，记录问题的发现、核对和处理过程，保留原始材料作为依据。\n\n`).join('');
const after=source.replace('项目 1\n','项目一 · 知识助手\n').replace('项目 17\n','项目十七 · 需求验收\n');
const initial:Opportunity={...demoOpportunities[0],id:'fictional-review-1109',resumeText:source,
  resumeGenerationId:'fictional:1',resumeOriginal:undefined,applicationQuality:undefined,resumeChanges:[{
    id:'whole',before:source,after,section:'整稿',reason:'虚构长稿：只修改两处标题，其他文字不应出现高亮。',evidenceId:null,status:'pending',
  }]};
const commentary='独立 HR 点评（针对首稿，供核对，不是审核通过）\n作者已回应，未再复审。\n\n'
  +'### 先核实责任范围\n**这里要确认的是你的实际职责。** 原材料写的是参与，不能把它理解为独立主导。'
  +'请先对照当时的任务分工，确定你负责哪一段；不清楚的地方可以保留，不需要为了好看补数据。'
  +'比如，你可能负责收集反馈，也可能设计了验收用例，这两种贡献需要不同的证据。'
  +'如果你确实设计了用例，可以补充你如何选场景、发现什么问题，以及这份结果后来由谁使用。'
  +'如果你只整理了反馈，就把整理方式和交付物写清楚，不必升级成主导整个项目。'
  +'这不是要求你提供所有细节，而是先找一项你能在面试中讲清楚的实际动作。'
  +'\n\n### 面试可能追问\n- **你的判断**：为什么优先处理这个问题？\n- **验证方法**：结果交给谁使用？';
const task:ResumeAgentTask={id:'fictional-review-task',state:'ready',question:null,answers:[],updatedAt:'2026-11-09T00:00:00Z',
  result:{changes:initial.resumeChanges,summary:'本轮调整了标题的表达。\n'+commentary,applicationQuality:{artifactId:'fixture',version:1,status:'draft',
    reviews:[{reviewerType:'independent_ai',status:'warning',summary:commentary}]}}};
const key='yizhi:fixture:review-1109';
const initialSnapshot=JSON.stringify(initial);
const subscribe=(notify:()=>void)=>{
  window.addEventListener(key,notify);window.addEventListener('storage',notify);
  return()=>{window.removeEventListener(key,notify);window.removeEventListener('storage',notify);};
};
const noop=async()=>{};
export default function ResumeReviewFixture({mentorGuidance=false}:{mentorGuidance?:boolean}){
  const [mode,setMode]=useState<ChatMode>('auto');
  const snapshot=useSyncExternalStore(subscribe,()=>localStorage.getItem(key)||initialSnapshot,()=>initialSnapshot);
  const item:Opportunity=JSON.parse(snapshot);
  const teaching = '**这段可能体现评测判断，不只是整理记录。** 我先保留已有事实，不写成独立主导。\n\n'
    + '可以回忆一次失败案例：你是按要求登记，还是自己判断了问题原因？想不起时先找一份当时的记录，'
    + '用“发现什么—凭什么判断—改了哪里—怎么验证”复盘，不需要补造数字。你本人当时做的关键判断是什么？';
  const visibleTask:ResumeAgentTask=mentorGuidance?{...task,result:{...task.result!,f6Deliverables:{
    files:{'resume-new.md':after,'changes.md':teaching},resumeRevision:1,renderedRevision:-1,
    mentorGuidance:{version:1,text:teaching,resumeRevision:1,current:true},
  }}}:task;
  const save=(next:Opportunity)=>{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event(key));};
  return <main className={styles.fixture}>
    <p>虚构交互验收 · 本地演示保存，不写云端，不调用模型</p>
    <nav aria-label="验收操作">
      <button onClick={()=>save(initial)}>重置演示</button>
      <button onClick={()=>save(travelResumeEdit(item,'undo'))}>撤销</button>
      <button onClick={()=>save(travelResumeEdit(item,'redo'))}>重做</button>
    </nav>
    <p role="status">{item.resumeChanges[0].status==='accepted'?'已保存新稿（仅此演示）':'待确认建议（仅此演示）'}</p>
    <div className={styles.panes}>
      <ResumeInlineReview opportunity={item} onUpdate={(id,status)=>save(rememberResumeEdit(item,
        {...item,resumeChanges:decideResumeChanges(item.resumeChanges,id,status)}))} onEdit={()=>{}} onReorder={()=>{}}/>
      <aside aria-label="虚构简历导师">
        <ResumeComposerModel.Provider value={{mode,control:<ModelPicker value={mode} onChange={setMode}
          catalog={catalogWithAvailability(['glm-5.3'])} connected/>}}>
          <ResumeAgentConversation task={visibleTask} busy={false} pendingCount={item.resumeChanges.filter(c=>c.status==='pending').length}
            onMessage={noop} onContinue={noop} onSkip={noop}/>
        </ResumeComposerModel.Provider>
      </aside>
    </div>
  </main>;
}
