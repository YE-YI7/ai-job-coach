"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import styles from "./ResumeAgentConversation.module.css";

const readableError=(cause:unknown)=>cause instanceof Error?/Failed to fetch|NetworkError|Load failed/i.test(cause.message)?'网络暂时断开，输入已保留。恢复后可以重试。':cause.message:'暂未保存，输入仍在，请重试';

export default function ResumeAgentConversation({task,busy,onMessage,onContinue,onSkip}:{task:ResumeAgentTask;busy:boolean;onMessage:(message:string,requestId:string)=>Promise<void>;onContinue:()=>Promise<void>;onSkip:()=>Promise<void>}){
  const key=`yizhi:resume-question:${task.id}:${task.question?.id||'request'}`;
  const [answer,setAnswer]=useState(''),[error,setError]=useState('');
  const sending=useRef(false);
  const messages=useRef<HTMLDivElement>(null);
  useEffect(()=>{try{setAnswer(localStorage.getItem(key)||'');}catch{}},[key]);
  const lastReply=task.conversation?.at(-1)?.reply;
  useEffect(()=>{const list=messages.current;if(list)list.scrollTop=list.scrollHeight;},[lastReply,task.question?.id,task.state,busy]);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(task.state!=='running')return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[task.state]);
  const retry=async()=>{setError('');try{await onContinue();}catch(cause){setError(readableError(cause));}};
  if(task.state==='idle'||task.state==='stale')return null;

  const conversation=task.conversation||[];
  const question=task.question;
  const running=task.state==='running';
  // A discussion reply must not be followed by a repeated old save/failure notice.
  const showOutcome=conversation.at(-1)?.decision!=='discuss';
  const factualAnswers=task.answers.filter(item=>item.kind!=='instruction');
  return <div className={styles.conversation}>
    <div ref={messages} className={styles.messages} role="log" aria-label="简历讨论" aria-live="polite" aria-relevant="additions text">
      {task.answers.length>0&&<details className={styles.records}>
        <summary>{factualAnswers.length?`补充记录 · ${factualAnswers.length} 条`:'本次修改要求'}</summary>
        {task.answers.map(item=><div key={item.id}><p>{item.question}</p><p>{item.skipped?'暂不补充，仅用已有事实':item.answer}</p></div>)}
      </details>}
      {conversation.map(turn=><div key={turn.id} className={styles.turn}>
        <div className={`${styles.message} ${styles.userMessage}`} aria-label="你"><p>{turn.message}</p></div>
        {turn.reply&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p>{turn.reply}</p></div>}
        {turn.status==='failed'&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p>这条消息还没处理完成，原稿没有改变。重新发送就能继续。</p></div>}
      </div>)}
      {running?<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
        <p className={styles.progress} role="status"><Loader2 size={16} className={styles.working} aria-hidden="true"/>正在修改你的简历…</p>
        {now-Date.parse(task.updatedAt)>=330_000&&<button className={styles.inlineAction} type="button" disabled={busy} onClick={()=>void retry()}>等待较久，重试这次修改</button>}
      </div>:<>
        {task.state==='failed'&&showOutcome&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
          <p>这次修改没有完成，原稿和补充都还在。可以重试，也可以先和我聊聊。</p>
          <div className={styles.messageTools}>
            <button className={styles.inlineAction} type="button" disabled={busy} onClick={()=>void retry()}>重试修改</button>
            <details className={styles.failureDetails}><summary>查看详情</summary><p>{task.error||'本次未生成可用修改，原稿已保留。'}</p><p>也可以点击简历中的段落，选择“编辑”。</p></details>
          </div>
        </div>}
        {task.state==='ready'&&showOutcome&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
          <p role="status">{task.result?.unchanged?'已检查，这一轮可以保留原文。':'修改稿已保存，可以在简历上核对。'}</p>
          {task.result?.summary&&<p>{task.result.summary}</p>}
        </div>}
        {question&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
          <p>{question.question}</p>
          <details className={styles.anchor}><summary>查看对应原文</summary><p>{question.sourceExcerpt}</p></details>
          <button className={styles.inlineAction} type="button" disabled={busy} onClick={async()=>{setError('');try{await onSkip();}catch(cause){setError(readableError(cause));}}}>{task.state==='ready'?'暂不补充':'先用已有内容修改'}</button>
        </div>}
        {!conversation.length&&!question&&task.state==='needs_detail'&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p>想先聊聊哪一段？写法、修改原因，或者要补充的经历，都可以告诉我。</p></div>}
      </>}
      {busy&&!running&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p role="status" className={styles.progress}><Loader2 size={16} className={styles.working} aria-hidden="true"/>导师正在思考…</p></div>}
    </div>
    <form className={styles.form} onSubmit={async event=>{event.preventDefault();if(!answer.trim()||busy||running||sending.current)return;setError('');sending.current=true;try{
      let receipt:{id:string;text:string}|null=null;try{receipt=JSON.parse(localStorage.getItem(`${key}:request`)||'null');}catch{}
      const requestId=receipt?.text===answer&&receipt.id?receipt.id:crypto.randomUUID();
      try{localStorage.setItem(`${key}:request`,JSON.stringify({id:requestId,text:answer}));}catch{}
      await onMessage(answer,requestId);setAnswer('');try{localStorage.removeItem(key);localStorage.removeItem(`${key}:request`);}catch{/* A server receipt must not become a failed save because local storage is unavailable. */}
    }catch(cause){setError(readableError(cause));}finally{sending.current=false;}}}>
      <label className={styles.srOnly} htmlFor={`resume-answer-${task.id}`}>给简历导师发消息</label>
      <div className={styles.composer}>
        <textarea id={`resume-answer-${task.id}`} rows={2} maxLength={2000} value={answer} disabled={busy||running} placeholder={running?'修改完成后可以继续聊…':'和导师聊聊这份简历…'} onChange={event=>{setAnswer(event.target.value);try{localStorage.setItem(key,event.target.value);}catch{/* The in-memory input remains editable. */}}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
        <div className={styles.actions}><button type="submit" className={styles.send} aria-label={busy?'正在保存':'发送'} disabled={busy||running||!answer.trim()}>{busy?<Loader2 size={18} className={styles.working} aria-hidden="true"/>:<ArrowUp size={18} aria-hidden="true"/>}</button></div>
      </div>
      {error&&<p className={styles.error} role="alert">{error}</p>}
    </form>
  </div>;
}
