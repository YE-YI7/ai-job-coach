"use client";
import {useEffect, useRef, useState} from "react";
import styles from "./AgentConversation.module.css";
import {cancelRunRequest, nextPollDelayMs, RUN_STATUS_WORDS, taskRunsFromRows, type TaskRun} from "./task-progress";

/**
 * FR-35 多步任务进度托盘（W6 订阅界面）。
 * 数据绑定处：GET /api/coach/runs?scope=active 与 POST /api/coach/runs/{id}
 * {action:"cancel"}（#61 已挂载，读的是 run-ledger 的未收口行）。
 * 端点不可用或返回不认的形状时整个托盘静默隐藏——关页面不代表丢失，
 * 但没接上的进度也绝不显示成假的样子。状态靠 6px 点 + 间距，不做卡片。
 */
export default function TaskRunTray({enabled=true}:{enabled?:boolean}){
 const [runs,setRuns]=useState<TaskRun[]>([]);
 const [cancelling,setCancelling]=useState<string|null>(null);
 const [error,setError]=useState("");
 const alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  if(!enabled){setRuns([]);return;}
  let timer:number|undefined;
  const tick=async()=>{
   try{
    const r=await fetch("/api/coach/runs?scope=active",{cache:"no-store"});
    if(!r.ok){if(alive.current){setRuns([]);timer=window.setTimeout(tick,60000);}return;}
    const b=await r.json();
    const next=taskRunsFromRows(b);
    if(!alive.current)return;
    setRuns(next);
    timer=window.setTimeout(tick,nextPollDelayMs(next));
   }catch{if(alive.current)timer=window.setTimeout(tick,60000);}
  };
  void tick();
  return()=>{alive.current=false;if(timer!==undefined)window.clearTimeout(timer);};
 },[enabled]);
 async function cancel(run:TaskRun){
  if(cancelling)return;setCancelling(run.id);setError("");
  try{
   const request=cancelRunRequest(run.id);
   const r=await fetch(request.path,{method:request.method,headers:{"Content-Type":"application/json"},body:JSON.stringify(request.body)});
   if(!r.ok)throw Error("cancel unavailable");
   setRuns(list=>list.map(item=>item.id===run.id?{...item,status:"cancelled",cancelable:false}:item));
  }catch{if(alive.current)setError("取消未成功，任务状态保持不变，请重试。");}
  finally{if(alive.current)setCancelling(null);}
 }
 if(!runs.length)return null;
 return <div className={styles.runTray} role="group" aria-label="后台任务">
  {error&&<p role="alert">{error}</p>}
  {runs.map(run=><p key={run.id} className={styles.runRow}><i className={styles.runDot} data-status={run.status} aria-hidden="true"/><span className={styles.runGoal}>{run.goal}</span><span className={styles.runStatus}>{RUN_STATUS_WORDS[run.status]}{run.awaitingUser?" · 等你一步":""}</span>{run.cancelable&&<button type="button" disabled={cancelling!==null} onClick={()=>void cancel(run)}>取消</button>}</p>)}
 </div>;
}
