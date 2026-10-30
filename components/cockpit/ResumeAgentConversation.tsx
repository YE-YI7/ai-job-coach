"use client";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { ResumeAgentTask } from "@/lib/coach-harness/resume-task-types";
import { resumeMessageExpired } from '@/lib/coach-harness/resume-conversation-recovery';
import styles from "./ResumeAgentConversation.module.css";
import TutorMarkdown from './TutorMarkdown';
import ResumeProcessingReceipt from './ResumeProcessingReceipt';
import ResumeComposerModel from './ResumeComposerModel';
import type {ChatMode} from '@/lib/coach-harness/chat-options';
import { ResumeReferenceDraft, ResumeReferencePreview, useResumeReference } from './ResumeReference';
import { sameResumeReference, type ResumeReference, type ResolvedResumeReference } from '@/lib/opportunities/resume-reference';

const readableError=(cause:unknown)=>cause instanceof Error?/Failed to fetch|NetworkError|Load failed/i.test(cause.message)?'网络暂时断开，输入已保留。恢复后可以重试。':cause.message:'暂未保存，输入仍在，请重试';

export default function ResumeAgentConversation({task,busy,onMessage,onContinue,onSkip}:{
  task:ResumeAgentTask;busy:boolean;
  onMessage:(message:string,requestId:string,onReply?:(text:string)=>void,onReceipt?:(task:ResumeAgentTask)=>void,modelMode?:ChatMode,reference?:ResumeReference)=>Promise<void>;
  onContinue:()=>Promise<void>;onSkip:()=>Promise<void>;
}){
  const key=`yizhi:resume-question:${task.id}:request`;
  const modelControl=useContext(ResumeComposerModel);
  const reference = useResumeReference();
  const selectedReference = reference?.selection;
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const quoteNonce = selectedReference?.nonce;
  useEffect(() => { if (quoteNonce) composerInput.current?.focus({preventScroll:true}); }, [quoteNonce]);
  const legacyKey=useRef(`yizhi:resume-question:${task.id}:${task.question?.id||'request'}`).current;
  const [answer,setAnswer]=useState(''),[error,setError]=useState('');
  const [errorId,setErrorId]=useState('');
  const sending=useRef(false);
  const messages=useRef<HTMLDivElement>(null);
  const answerRef=useRef(''),scopeRef=useRef(key);
  const taskRef=useRef(task);taskRef.current=task;
  const [unconfirmedReplies,setUnconfirmedReplies]=useState<Record<string,string>>({});
  const [incoming,setIncoming]=useState<{id:string;message:string;reply:string;resumeReference?:ResolvedResumeReference}|null>(null);
  const [readingTurn,setReadingTurn]=useState<{id:string;height:number}|null>(null);
  useEffect(()=>{scopeRef.current=key;let draft='';try{draft=localStorage.getItem(key)||localStorage.getItem(legacyKey)||'';if(draft&&legacyKey!==key){localStorage.setItem(key,draft);localStorage.removeItem(legacyKey);}}catch{}answerRef.current=draft;setAnswer(draft);},[key,legacyKey]);
  // Restore history once. Streaming updates and server receipts never pull a
  // reader to the bottom; the newly sent turn owns one stable reading space.
  useEffect(()=>{const list=messages.current;if(list)list.scrollTop=list.scrollHeight;},[task.id]);
  const incomingId=incoming?.id;
  useLayoutEffect(()=>{
    const list=messages.current;if(!list||!incomingId)return;
    setReadingTurn({id:incomingId,height:Math.max(160,list.clientHeight-16)});
  },[incomingId]);
  const readingTurnId=readingTurn?.id;
  useLayoutEffect(()=>{
    const list=messages.current;if(!list||!readingTurnId)return;
    const turn=list.querySelector<HTMLElement>(`[data-turn-id="${readingTurnId}"]`);
    if(turn)list.scrollTop+=turn.getBoundingClientRect().top-list.getBoundingClientRect().top-8;
  },[readingTurnId]);
  const [now,setNow]=useState(()=>Date.now());
  const pending=task.conversation?.some(turn=>turn.status==='pending');
  useEffect(()=>{if(task.state!=='running'&&!pending)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[task.state,pending]);
  const sendMessage=async(text:string,requestId:string,quoted?:ResumeReference)=>{
    if(busy||task.state==='running'||sending.current)return;
    setError('');setErrorId(requestId);sending.current=true;
    setIncoming({id:requestId,message:text,reply:'',...(sameResumeReference(quoted,selectedReference?.pointer)&&selectedReference?.preview?{resumeReference:selectedReference.preview}:{})});
    const wasDraft=answerRef.current.trim()===text.trim();
    if(wasDraft){answerRef.current='';setAnswer('');try{localStorage.removeItem(key);}catch{}}
    let preview='',receivedTurn:NonNullable<ResumeAgentTask['conversation']>[number]|undefined;
    try{
      await onMessage(text,requestId,
        reply=>{preview=reply;if(scopeRef.current===key)setIncoming(current=>current?.id===requestId?{...current,reply}:current);},
        receipt=>{receivedTurn=receipt.conversation?.find(turn=>turn.id===requestId);},modelControl?.mode,quoted);
      if (quoted) reference?.clear(quoted);
      try{const receipt=JSON.parse(localStorage.getItem(`${key}:request`)||'null');if(receipt?.id===requestId)localStorage.removeItem(`${key}:request`);}catch{}
    }catch(cause){
      if(scopeRef.current===key){
        const received=receivedTurn||taskRef.current.conversation?.find(turn=>turn.id===requestId);
        if (quoted && received?.status === 'completed') reference?.clear(quoted);
        if(received?.status!=='completed')setError(readableError(cause));
        if(preview&&!received?.reply)setUnconfirmedReplies(current=>({...current,[requestId]:preview}));
        // The saved user message is not an unsent draft. Preserve a newer draft
        // and never put already-received text back in the composer after an
        // editor failure or a broken final stream.
        if(!received&&wasDraft&&!answerRef.current){answerRef.current=text;setAnswer(text);try{localStorage.setItem(key,text);}catch{}}
      }
    }finally{sending.current=false;if(scopeRef.current===key)setIncoming(null);}
  };
  const retry=async()=>{setError('');try{await onContinue();}catch(cause){setError(readableError(cause));}};
  if(task.state==='idle'||task.state==='stale')return null;

  const conversation=task.conversation||[];
  const visibleTurns=incoming&&!conversation.some(turn=>turn.id===incoming.id)?[...conversation,{...incoming,status:'pending' as const,savedAt:''}]:conversation;
  const question=task.question;
  const running=task.state==='running';
  // A discussion reply must not be followed by a repeated old save/failure notice.
  const latest=conversation.at(-1);
  const awaitingReply=conversation.some(turn=>turn.status==='pending'&&!resumeMessageExpired(turn,now));
  const showOutcome=!latest||(latest.status==='completed'&&latest.decision==='revise');
  const factualAnswers=task.answers.filter(item=>item.kind!=='instruction');
  return <div className={styles.conversation}>
    <div ref={messages} className={styles.messages} role="log" aria-label="简历讨论" aria-live="polite" aria-relevant="additions text">
      {task.answers.length>0&&<details className={styles.records}>
        <summary>{factualAnswers.length?`补充记录 · ${factualAnswers.length} 条`:'本次修改要求'}</summary>
        {task.answers.map(item=><div key={item.id}><p>{item.question}</p><p>{item.skipped?'暂不补充，仅用已有事实':item.answer}</p></div>)}
      </details>}
      {(running||showOutcome)&&task.processing&&<ResumeProcessingReceipt processing={task.processing}/>}
      {visibleTurns.map(turn=><div key={turn.id} data-turn-id={turn.id} className={styles.turn} style={readingTurn?.id===turn.id?{minHeight:readingTurn.height}:undefined}>
        <div className={`${styles.message} ${styles.userMessage}`} aria-label="你">
          {'resumeReference' in turn && turn.resumeReference && <ResumeReferencePreview reference={turn.resumeReference}/>}
          <p>{turn.message}</p>
        </div>
        {(incoming?.id===turn.id?incoming.reply||turn.reply:turn.reply||unconfirmedReplies[turn.id])&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师" aria-busy={incoming?.id===turn.id||undefined}><TutorMarkdown className={styles.reply} streaming={incoming?.id===turn.id}>{incoming?.id===turn.id?incoming.reply||turn.reply:turn.reply||unconfirmedReplies[turn.id]}</TutorMarkdown>{!turn.reply&&incoming?.id!==turn.id&&unconfirmedReplies[turn.id]&&<p>这段回复尚未确认保存。</p>}</div>}
        {incoming?.id===turn.id&&!incoming.reply&&!turn.reply&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p role="status" className={styles.progress}><span className={styles.reading} aria-hidden="true"/><span>导师正在思考…</span></p></div>}
        {incoming?.id!==turn.id&&(turn.status==='failed'||resumeMessageExpired(turn,now))&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
          <p>{turn.failure?.message||'这条消息暂时没处理完成，内容已保留。可以重新发送。'}</p>
          <div className={styles.messageTools}>
            <button className={styles.inlineAction} type="button" disabled={busy||running||awaitingReply}
              onClick={()=>void sendMessage(turn.message,turn.id,turn.resumeReference)}>重新发送</button>
          </div>
        </div>}
      </div>)}
      {running?<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
        <p className={styles.progress} role="status"><span className={styles.reading} aria-hidden="true" /><span>正在修改你的简历…</span></p>
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
          <p role="status">{task.result?.unchanged?'本轮未新增修改，原文保留。':task.result?.partial?'本轮只完成了部分修改建议。':'本轮修改建议已保存，等待你确认。'}</p>
          {task.result?.summary&&<TutorMarkdown className={styles.reply}>{task.result.summary}</TutorMarkdown>}
        </div>}
        {question&&!incoming&&(!latest||latest.status!=='completed'||latest.decision==='revise')&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师">
          <TutorMarkdown className={styles.reply}>{question.question}</TutorMarkdown>
          <details className={styles.anchor}><summary>查看对应原文</summary><p>{question.sourceExcerpt}</p></details>
          <button className={styles.inlineAction} type="button" disabled={busy} onClick={async()=>{setError('');try{await onSkip();}catch(cause){setError(readableError(cause));}}}>{task.state==='ready'?'暂不补充':'先用已有内容修改'}</button>
        </div>}
        {!conversation.length&&!question&&task.state==='needs_detail'&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p>想先聊聊哪一段？写法、修改原因，或者要补充的经历，都可以告诉我。</p></div>}
      </>}
      {(busy||awaitingReply)&&!running&&!incoming&&<div className={`${styles.message} ${styles.mentorMessage}`} aria-label="导师"><p role="status" className={styles.progress}><span className={styles.reading} aria-hidden="true" /><span>导师正在思考…</span></p></div>}
    </div>
    <form className={styles.form} onSubmit={async event=>{event.preventDefault();if((!answer.trim()&&!selectedReference)||selectedReference?.error||busy||running||awaitingReply||sending.current)return;
      const quoted=selectedReference?.pointer, text=answer.trim() || '请解释这处修改。';
      let receipt:{id:string;text:string;reference?:ResumeReference}|null=null;try{receipt=JSON.parse(localStorage.getItem(`${key}:request`)||'null');}catch{}
      const failed=[...conversation].reverse().find(turn=>(turn.status==='failed'||resumeMessageExpired(turn,now))&&turn.message===text&&sameResumeReference(turn.resumeReference,quoted));
      const requestId=failed?.id||(receipt?.text===text&&sameResumeReference(receipt.reference,quoted)&&receipt.id?receipt.id:crypto.randomUUID());
      try{localStorage.setItem(`${key}:request`,JSON.stringify({id:requestId,text,reference:quoted}));}catch{}
      await sendMessage(text,requestId,quoted);
    }}>
      <label className={styles.srOnly} htmlFor={`resume-answer-${task.id}`}>给简历导师发消息</label>
      <div className={styles.composer}>
        <ResumeReferenceDraft/>
        <textarea ref={composerInput} id={`resume-answer-${task.id}`} rows={2} maxLength={2000} value={answer}
          placeholder={busy||running?'可以先写下一条，等导师完成后发送…':'和导师聊聊这份简历…'}
          onChange={event=>{answerRef.current=event.target.value;setAnswer(event.target.value);
            try{localStorage.setItem(key,event.target.value);}catch{/* The in-memory input remains editable. */}}}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){
            event.preventDefault();event.currentTarget.form?.requestSubmit();
          }}}/>
        <div className={styles.actions}>
          {modelControl&&<fieldset
            className={styles.modelControl}
            disabled={busy||running||awaitingReply}
            title="选择简历讨论的模型；改稿和独立质检沿用原流程"
          >{modelControl.control}</fieldset>}
          <button type="submit" className={styles.send}
            aria-label={busy||awaitingReply?'正在处理':'发送'}
            disabled={busy||running||awaitingReply||Boolean(selectedReference?.error)||(!answer.trim()&&!selectedReference)}
          >{busy||awaitingReply?<span className={styles.reading} aria-hidden="true" />:<ArrowUp size={18} aria-hidden="true"/>}</button>
        </div>
      </div>
      {error&&!conversation.some(turn=>turn.id===errorId&&turn.status==='failed')&&<p className={styles.error} role="alert">{error}</p>}
    </form>
  </div>;
}
