"use client";
import { useEffect, useState } from "react";
import { Check, ArrowUp, Loader2 } from "lucide-react";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import styles from "./ResumeAgentConversation.module.css";

const readableError=(cause:unknown)=>cause instanceof Error?/Failed to fetch|NetworkError|Load failed/i.test(cause.message)?'网络暂时断开，输入已保留。恢复后可以重试。':cause.message:'暂未保存，输入仍在，请重试';
// Old tasks used this catch-all even for cosmetic/no-deliverable rejections.
const failureText=(message?:string)=>message&&/未通过事实校验|未通过文字与事实质检/.test(message)
  ?'这次没能生成可用的修改，简历没有被覆盖。原文和已保存的补充仍在，本次未扣额度。'
  :message||'这次修改没有完成，原文和已保存的补充仍在。';

export default function ResumeAgentConversation({task,busy,onAnswer,onRequest,onContinue,onSkip}:{task:ResumeAgentTask;busy:boolean;onAnswer:(answer:string)=>Promise<void>;onRequest:(request:string)=>Promise<void>;onContinue:()=>Promise<void>;onSkip:()=>Promise<void>}){
  const key=`yizhi:resume-question:${task.id}:${task.question?.id||'request'}`;
  const [answer,setAnswer]=useState(()=>{try{return localStorage.getItem(key)||'';}catch{return '';}}),[error,setError]=useState('');
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(task.state!=='running')return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[task.state]);
  const retry=async()=>{setError('');try{await onContinue();}catch(cause){setError(readableError(cause));}};
  if(task.state==='idle'||task.state==='stale')return null;
  if(task.state==='running')return <div className={styles.waiting}><p role="status"><Loader2 size={17} className={styles.working} aria-hidden="true"/>正在修改你的简历</p><p>已保存的要求和经历补充会继续使用。</p>{now-Date.parse(task.updatedAt)>=330_000&&<button type="button" disabled={busy} onClick={()=>void retry()}>等待较久，从已保存材料重试</button>}{error&&<p role="alert">{error}</p>}</div>;
  const question=task.question;
  const factualAnswers=task.answers.filter(item=>item.kind!=='instruction');
  const hintId=`resume-hint-${task.id}`;
  return <div className={styles.conversation}>
    {task.state==='failed'&&<div className={styles.failed}><p role="alert">{failureText(task.error)}</p><button type="button" disabled={busy} onClick={()=>void retry()}>重试这次修改</button><p className={styles.editHint}>也可以点击简历中的段落，再选“编辑”，直接修改文字。</p></div>}
    {task.state==='ready'&&<><p role="status" className={styles.complete}><Check size={17} aria-hidden="true"/>{task.result?.unchanged?'已检查，当前内容可以保留。':'修改稿已保存。'}</p><p>{task.result?.summary||(task.result?.unchanged?'本轮没有新增修改，仍可直接编辑或导出。':'可以在简历上核对修改，也可以继续告诉我想调整哪里。')}</p></>}
    {task.answers.length>0&&<details><summary>{factualAnswers.length?`已补充 ${factualAnswers.length} 条 · 查看记录`:'查看本次修改要求'}</summary>{task.answers.map(item=><div key={item.id}><p>{item.question}</p><p>{item.skipped?'暂不补充，仅用已有事实':item.answer}</p></div>)}</details>}
    <form onSubmit={async event=>{event.preventDefault();if(!answer.trim()||busy)return;setError('');try{await (question?onAnswer(answer):onRequest(answer));setAnswer('');try{localStorage.removeItem(key);}catch{/* A server receipt must not become a failed save because local storage is unavailable. */}}catch(cause){setError(readableError(cause));}}}>
      <label htmlFor={`resume-answer-${task.id}`}>{question?question.question:'你想先调整哪里？'}</label>
      {question?<details className={styles.anchor}><summary>对应原文</summary><p>{question.sourceExcerpt}</p></details>:<p id={hintId} className={styles.voice}>可以说“实习那段再精简些”。修改要求不会被当成经历；需要细节时，我会一次问一个。</p>}
      <div className={styles.composer}>
        <textarea id={`resume-answer-${task.id}`} aria-describedby={!question?hintId:undefined} rows={3} maxLength={2000} value={answer} disabled={busy} placeholder={question?'写你实际做过的内容；不知道也可以直接说。':'说说想改哪一处、希望怎么改…'} onChange={event=>{setAnswer(event.target.value);try{localStorage.setItem(key,event.target.value);}catch{/* The in-memory input remains editable. */}}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
        <div className={styles.actions}>{question&&<button type="button" disabled={busy} onClick={async()=>{setError('');try{await onSkip();}catch(cause){setError(readableError(cause));}}}>{task.state==='ready'?'暂不补充':'先修改已有内容'}</button>}<button type="submit" className={styles.send} aria-label={busy?'正在保存':'发送'} disabled={busy||!answer.trim()}>{busy?<Loader2 size={15} className={styles.working} aria-hidden="true"/>:<ArrowUp size={15} aria-hidden="true"/>}</button></div>
      </div>
      {error&&<p role="alert">{error}</p>}
    </form>
  </div>;
}
