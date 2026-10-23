import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ResumeAgentConversation from '../../components/cockpit/ResumeAgentConversation';
import type {ResumeAgentTask} from '../../lib/coach-harness/resume-task-types';

// Fictional local fixture. The production component is exercised without any
// network, production identity, quota reservation, or model request.
const initial:ResumeAgentTask={id:'offline-message-replay',state:'needs_detail',question:{id:'first-question',sourceExcerpt:'参与虚构项目并整理相关材料。',field:'deliverable',question:'这段经历最后交付了什么？'},answers:[],conversation:[],updatedAt:new Date().toISOString()};
const control=window as unknown as {qa:{finish:(mode:string)=>void}};
function App(){
 const [task,setTask]=useState<ResumeAgentTask>(()=>JSON.parse(localStorage.getItem('qa:task')||'null')||initial);
 const [busy,setBusy]=useState(false);
 const save=(next:ResumeAgentTask)=>{localStorage.setItem('qa:task',JSON.stringify(next));setTask(next);};
 return <main style={{height:'90vh',maxWidth:480,margin:'auto'}}><ResumeAgentConversation key={task.id} task={task} busy={busy} onContinue={async()=>{}} onSkip={async()=>{}}
  onMessage={async(message,id,onReply,onReceipt)=>{
   setBusy(true);
   const pending:ResumeAgentTask={...task,conversation:[...(task.conversation||[]),{id,message,reply:'',status:'pending',savedAt:new Date().toISOString()}]};
   save(pending);onReceipt?.(pending);
   onReply?.('**已收到补充。**\n\n先确认这属于哪段经历。');
   try{await new Promise<void>((resolve,reject)=>{control.qa={finish:mode=>{
    if(mode==='completed'){
     const completed:ResumeAgentTask={...pending,state:'failed',question:null,conversation:pending.conversation!.map(t=>t.id===id?{...t,status:'completed',reply:'**已收到补充。**\n\n先确认这属于哪段经历。',decision:'discuss'}:t)};
     save(completed);onReceipt?.(completed);
     reject(Error('后续编辑失败'));
    }else if(mode==='same-batch'){
     const completed:ResumeAgentTask={...pending,conversation:pending.conversation!.map(t=>({...t,status:'completed',reply:'同一批回执已保存。',decision:'discuss'}))};
     save(completed);onReceipt?.(completed);reject(Error('最终流断开'));
    }else if(mode==='lost-done')reject(Error('最终流断开'));
    else resolve();
   }};});}finally{setBusy(false);}
  }}/></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
