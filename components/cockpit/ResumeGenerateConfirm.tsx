"use client";

import {useEffect, useRef} from 'react';
import styles from './ResumeGenerateConfirm.module.css';

export default function ResumeGenerateConfirm({fee,onConfirm,onClose}:{
  fee:string;onConfirm:()=>void;onClose:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const submitted=useRef(false);
  useEffect(()=>{
    const node=dialog.current;
    node?.showModal();
    return ()=>node?.close();
  },[]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="resume-generate-title"
    aria-describedby="resume-generate-description" onCancel={onClose}>
    <h2 id="resume-generate-title">确认修改整份简历？</h2>
    <p id="resume-generate-description">会调用模型编辑整份简历，并进行独立质检。完成后请核对修改。</p>
    <dl>
      <div><dt>耗时</dt><dd>可能需要几分钟</dd></div>
      <div><dt>当前计费</dt><dd>{fee}</dd></div>
    </dl>
    <p className={styles.note}>费用按现有规则结算，当前无法可靠预估实扣金额。关闭此窗口不会启动任务。</p>
    <div className={styles.actions}>
      <button type="button" autoFocus onClick={onClose}>先不修改</button>
      <button type="button" className={styles.confirm} onClick={()=>{
        if(submitted.current)return;
        submitted.current=true;
        onClose();
        onConfirm();
      }}>确认并开始</button>
    </div>
  </dialog>;
}
