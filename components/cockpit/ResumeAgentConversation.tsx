"use client";
import { useEffect, useState } from "react";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import styles from "./ResumeAgentConversation.module.css";

export default function ResumeAgentConversation({task,busy,onAnswer,onContinue,onSkip}:{task:ResumeAgentTask;busy:boolean;onAnswer:(answer:string)=>Promise<void>;onContinue:()=>void;onSkip:()=>Promise<void>}){
  const key=`yizhi:resume-question:${task.id}:${task.question?.id||''}`;
  const [answer,setAnswer]=useState(()=>{try{return localStorage.getItem(key)||'';}catch{return '';}}),[error,setError]=useState('');
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(task.state!=='running')return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[task.state]);
  if(task.state==='ready'||task.state==='idle'||task.state==='stale')return null;
  if(task.state==='running')return <div className={styles.waiting}><p role="status">导师正在整理你的材料，已保存的补充不会丢失。</p>{now-Date.parse(task.updatedAt)>=210_000&&<button type="button" disabled={busy} onClick={onContinue}>这次等待较久，从已保存材料重试</button>}</div>;
  return <div className={styles.conversation}>
    {task.answers.length>0&&<details><summary>已补充 {task.answers.length} 条</summary>{task.answers.map(item=><div key={item.id}><p>{item.question}</p><p>{item.skipped?'暂不补充，仅用已有事实':item.answer}</p></div>)}</details>}
    {task.state==='failed'?<div className={styles.failed}><p role="alert">{task.error||'这次修改暂未完成，补充仍保留。'}</p><button type="button" disabled={busy} onClick={onContinue}>从已保存材料继续</button></div>:task.question&&<form onSubmit={async event=>{event.preventDefault();if(!answer.trim()||busy)return;setError('');try{await onAnswer(answer);setAnswer('');localStorage.removeItem(key);}catch(cause){setError(cause instanceof Error?cause.message:'暂未保存，输入仍在，请重试');}}}>
      <p className={styles.voice}>导师</p>
      <label htmlFor={`resume-answer-${task.id}`}>{task.question.question}</label>
      <details className={styles.anchor}><summary>对应原文</summary><p>{task.question.sourceExcerpt}</p></details>
      <textarea id={`resume-answer-${task.id}`} rows={3} maxLength={2000} value={answer} disabled={busy} placeholder="写你实际做过的内容；不知道也可以直接说。" onChange={event=>{setAnswer(event.target.value);try{localStorage.setItem(key,event.target.value);}catch{/* 内存中的输入保留。 */}}}/>
      {error&&<p role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={async()=>{setError('');try{await onSkip();}catch(cause){setError(cause instanceof Error?cause.message:'暂未完成，请重试');}}}>先用已有材料</button><button type="submit" disabled={busy||!answer.trim()}>{busy?'正在保存并整理…':'保存并继续'}</button></div>
    </form>}
  </div>;
}
