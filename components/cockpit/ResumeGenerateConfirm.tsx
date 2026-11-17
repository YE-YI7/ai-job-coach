"use client";

import {useEffect, useRef, useState} from 'react';
import {loadResumeStartAdvice, type ResumeStartAdvice} from '@/lib/resume-allowance';
import styles from './ResumeGenerateConfirm.module.css';

export default function ResumeGenerateConfirm({fee,onConfirm,onClose}:{
  fee:string;onConfirm:()=>void;onClose:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const submitted=useRef(false);
  const [advice,setAdvice]=useState<ResumeStartAdvice|null>(null);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const node=dialog.current;
    node?.showModal();
    return ()=>node?.close();
  },[]);
  useEffect(()=>{
    let active=true;
    void loadResumeStartAdvice().then(value=>{if(active)setAdvice(value);})
      .catch(()=>{if(active)setError('暂时无法确认额度，请刷新查询后再开始；当前未启动改稿。');})
      .finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;};
  },[attempt]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="resume-generate-title"
    aria-describedby="resume-generate-description" onCancel={onClose}>
    <h2 id="resume-generate-title">确认修改整份简历？</h2>
    <p id="resume-generate-description">会编辑整份简历。完成后请核对修改，再决定是否采纳。</p>
    <dl>
      <div><dt>耗时</dt><dd>可能需要几分钟</dd></div>
      <div><dt>当前计费</dt><dd>{checking?'正在确认最新额度…':advice?.fee||fee}</dd></div>
    </dl>
    <p className={styles.note} role="status">{advice?.note||'只查询额度，不预留、不扣费。关闭此窗口不会启动任务。'}</p>
    {error&&<p role="alert">{error}</p>}
    {!checking&&(error||advice?.allowed===false)&&<div className={styles.recovery}>
      <span>补充额度后，可在这里重新查询。</span>
      <button type="button" onClick={()=>{
        setChecking(true);setError('');setAdvice(null);setAttempt(value=>value+1);
      }}>刷新额度</button>
    </div>}
    <div className={styles.actions}>
      <button type="button" autoFocus onClick={onClose}>先不修改</button>
      <button type="button" className={styles.confirm} disabled={checking||!advice?.allowed} onClick={()=>{
        if(submitted.current)return;
        if(checking||!advice?.allowed)return;
        submitted.current=true;
        onClose();
        onConfirm();
      }}>确认并开始</button>
    </div>
  </dialog>;
}
