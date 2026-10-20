"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowUp, Loader2 } from "lucide-react";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import styles from "./ResumeAgentConversation.module.css";

const readableError=(cause:unknown)=>cause instanceof Error?/Failed to fetch|NetworkError|Load failed/i.test(cause.message)?'网络暂时断开，输入已保留。恢复后可以重试。':cause.message:'暂未保存，输入仍在，请重试';
// Old tasks used this catch-all even for cosmetic/no-deliverable rejections.
const failureText=(message?:string)=>message&&/未通过事实校验|未通过文字与事实质检/.test(message)
  ?'这次没能生成可用的修改，简历没有被覆盖。原文和已保存的补充仍在，本次未扣额度。'
  :message||'这次修改没有完成，原文和已保存的补充仍在。';

export default function ResumeAgentConversation({task,busy,onMessage,onContinue,onSkip}:{task:ResumeAgentTask;busy:boolean;onMessage:(message:string,requestId:string)=>Promise<void>;onContinue:()=>Promise<void>;onSkip:()=>Promise<void>}){
  const key=`yizhi:resume-question:${task.id}:${task.question?.id||'request'}`;
  const [answer,setAnswer]=useState(''),[error,setError]=useState('');
  const sending=useRef(false);
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{try{setAnswer(localStorage.getItem(key)||'');}catch{}},[key]);
  const lastReply=task.conversation?.at(-1)?.reply;
  useEffect(()=>{if(lastReply)form.current?.scrollIntoView({block:'end',behavior:'auto'});},[lastReply]);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(task.state!=='running')return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[task.state]);
  const retry=async()=>{setError('');try{await onContinue();}catch(cause){setError(readableError(cause));}};
  if(task.state==='idle'||task.state==='stale')return null;
  if(task.state==='running')return <div className={styles.waiting}><p role="status"><Loader2 size={17} className={styles.working} aria-hidden="true"/>正在修改你的简历</p><p>已保存的要求和经历补充会继续使用。</p>{now-Date.parse(task.updatedAt)>=330_000&&<button type="button" disabled={busy} onClick={()=>void retry()}>等待较久，从已保存材料重试</button>}{error&&<p role="alert">{error}</p>}</div>;
  const question=task.question;
  const conversation=task.conversation||[];
  const factualAnswers=task.answers.filter(item=>item.kind!=='instruction');
  const hintId=`resume-hint-${task.id}`;
  return <div className={styles.conversation}>
    {task.state==='failed'&&<div className={styles.failed}><p role="alert">{failureText(task.error)}</p><button type="button" disabled={busy} onClick={()=>void retry()}>重试这次修改</button><p className={styles.editHint}>也可以点击简历中的段落，再选“编辑”，直接修改文字。</p></div>}
    {task.state==='ready'&&conversation.at(-1)?.decision!=='discuss'&&<><p role="status" className={styles.complete}><Check size={17} aria-hidden="true"/>{task.result?.unchanged?'已检查，当前内容可以保留。':'修改稿已保存。'}</p><p>{task.result?.summary||(task.result?.unchanged?'本轮没有新增修改，仍可直接编辑或导出。':'可以在简历上核对修改，也可以继续讨论。')}</p></>}
    {task.answers.length>0&&<details><summary>{factualAnswers.length?`已补充 ${factualAnswers.length} 条 · 查看记录`:'查看本次修改要求'}</summary>{task.answers.map(item=><div key={item.id}><p>{item.question}</p><p>{item.skipped?'暂不补充，仅用已有事实':item.answer}</p></div>)}</details>}
    {conversation.length>0&&<div className={styles.dialogue} role="log" aria-label="简历讨论" aria-live="polite">{conversation.map(turn=><div key={turn.id} className={styles.turn}><p className={styles.userMessage}><span>你</span>{turn.message}</p>{turn.reply&&<p className={styles.mentorMessage}><span>导师</span>{turn.reply}</p>}{turn.status==='failed'&&<p className={styles.voice}>这条消息暂未完成，原稿没有因此改变，可以重试。</p>}</div>)}</div>}
    {busy&&<p className={styles.voice} role="status">导师正在思考…</p>}
    <form ref={form} onSubmit={async event=>{event.preventDefault();if(!answer.trim()||busy||sending.current)return;setError('');sending.current=true;try{
      let receipt:{id:string;text:string}|null=null;try{receipt=JSON.parse(localStorage.getItem(`${key}:request`)||'null');}catch{}
      const requestId=receipt?.text===answer&&receipt.id?receipt.id:crypto.randomUUID();
      try{localStorage.setItem(`${key}:request`,JSON.stringify({id:requestId,text:answer}));}catch{}
      await onMessage(answer,requestId);setAnswer('');try{localStorage.removeItem(key);localStorage.removeItem(`${key}:request`);}catch{/* A server receipt must not become a failed save because local storage is unavailable. */}
    }catch(cause){setError(readableError(cause));}finally{sending.current=false;}}}>
      <label htmlFor={`resume-answer-${task.id}`}>{question?question.question:conversation.length?'继续聊聊':'想聊聊这份简历？'}</label>
      {question?<details className={styles.anchor}><summary>对应原文</summary><p>{question.sourceExcerpt}</p></details>:<p id={hintId} className={styles.voice}>可以讨论写法、问问原因，或补充真实经历。需要修改时，导师会接着改。</p>}
      <div className={styles.composer}>
        <textarea id={`resume-answer-${task.id}`} aria-describedby={!question?hintId:undefined} rows={3} maxLength={2000} value={answer} disabled={busy} placeholder="说说你的想法，或问问为什么…" onChange={event=>{setAnswer(event.target.value);try{localStorage.setItem(key,event.target.value);}catch{/* The in-memory input remains editable. */}}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
        <div className={styles.actions}>{question&&<button type="button" disabled={busy} onClick={async()=>{setError('');try{await onSkip();}catch(cause){setError(readableError(cause));}}}>{task.state==='ready'?'暂不补充':'先修改已有内容'}</button>}<button type="submit" className={styles.send} aria-label={busy?'正在保存':'发送'} disabled={busy||!answer.trim()}>{busy?<Loader2 size={15} className={styles.working} aria-hidden="true"/>:<ArrowUp size={15} aria-hidden="true"/>}</button></div>
      </div>
      {error&&<p role="alert">{error}</p>}
    </form>
  </div>;
}
