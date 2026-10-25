"use client";
import {useEffect, useRef, useState} from "react";
import styles from "./AgentConversation.module.css";
import {
 cancelRunRequest,
 nextPollDelayMs,
 parseCancelResponse,
 RUN_STATUS_WORDS,
 taskRunsFromRows,
 type TaskRun,
} from "./task-progress";

async function readRuns():Promise<TaskRun[]|null>{
 try{
  const response=await fetch("/api/coach/runs?scope=active",{cache:"no-store"});
  if(!response.ok)return null;
  return taskRunsFromRows(await response.json());
 }catch{return null;}
}

/**
 * FR-35 多步任务进度托盘（W6 订阅界面）。
 * 数据绑定处：GET /api/coach/runs?scope=active 与 POST /api/coach/runs/{id}
 * {action:"cancel"}（#61 已挂载，读的是 run-ledger 的未收口行）。
 * 端点不可用或返回不认的形状时整个托盘静默隐藏——关页面不代表丢失，
 * 但没接上的进度也绝不显示成假的样子。状态靠 6px 点 + 间距，不做卡片。
 *
 * 取消只认服务端回写的 status：HTTP 成功不等于已停止，
 * 保存窗口会回 partial，界面必须如实保留已完成的步骤。
 */
export default function TaskRunTray({enabled=true}:{enabled?:boolean}){
 const [runs,setRuns]=useState<TaskRun[]>([]);
 const [cancelling,setCancelling]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  if(!enabled){setRuns([]);return;}
  let timer:number|undefined;
  const tick=async()=>{
   const next=await readRuns();
   if(!alive.current)return;
   if(!next){setRuns([]);timer=window.setTimeout(tick,60000);return;}
   setRuns(next);
   timer=window.setTimeout(tick,nextPollDelayMs(next));
  };
  void tick();
  return()=>{alive.current=false;if(timer!==undefined)window.clearTimeout(timer);};
 },[enabled]);
 async function cancel(run:TaskRun){
  if(cancelling)return;
  setCancelling(run.id);setError("");setNotice("");
  try{
   const request=cancelRunRequest(run.id);
   const response=await fetch(request.path,{method:request.method,headers:{"Content-Type":"application/json"},body:JSON.stringify(request.body)});
   const body=await response.json().catch(()=>null);
   const outcome=parseCancelResponse(response.ok,body);
   if(outcome.kind==="unconfirmed"){
    const refreshed=await readRuns();
    if(!alive.current)return;
    if(refreshed)setRuns(refreshed);
    setError(refreshed?outcome.message:"取消没有保存到云端，也没能重新确认任务状态；请稍后重试。");
    return;
   }
   if(!alive.current)return;
   setRuns(list=>list.map(item=>item.id===run.id?{...item,status:outcome.kind,cancelable:false}:item));
   setNotice(outcome.message);
   void readRuns().then(next=>{if(alive.current&&next)setRuns(next);});
  }catch{
   const refreshed=await readRuns();
   if(!alive.current)return;
   if(refreshed)setRuns(refreshed);
   setError(refreshed?"取消没有保存到云端；已重新读取任务状态，请以当前显示为准。":"取消没有保存到云端，也没能重新确认任务状态；请稍后重试。");
  }finally{if(alive.current)setCancelling(null);}
 }
 if(!runs.length)return null;
 return <div className={styles.runTray} role="group" aria-label="后台任务">
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {runs.map(run=><p key={run.id} className={styles.runRow}><i className={styles.runDot} data-status={run.status} aria-hidden="true"/><span className={styles.runGoal}>{run.goal}</span><span className={styles.runStatus}>{RUN_STATUS_WORDS[run.status]}{run.awaitingUser?" · 等你一步":""}</span>{run.cancelable&&<button type="button" disabled={cancelling!==null} aria-busy={cancelling===run.id} onClick={()=>void cancel(run)}>取消</button>}</p>)}
 </div>;
}
