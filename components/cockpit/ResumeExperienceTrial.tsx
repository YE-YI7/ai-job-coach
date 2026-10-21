"use client";
import {useEffect,useId,useState} from 'react';
import {resumeTrialTargets} from '@/lib/resume-experience-trial';
import styles from './ResumeExperienceTrial.module.css';

export default function ResumeExperienceTrial({resume,busy,onStart}:{resume:string;busy:boolean;onStart:(blockId:string,excerpt:string)=>Promise<void>}) {
  const [available,setAvailable]=useState(false),[selected,setSelected]=useState(''),[error,setError]=useState('');
  const id=useId(),targets=resumeTrialTargets(resume),target=targets.find(item=>item.blockId===selected);
  useEffect(()=>{
    if(busy)return;
    const controller=new AbortController();
    fetch('/api/quota/check',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null)
      .then(body=>{if(!controller.signal.aborted)setAvailable(body?.resumeTrial?.available===true);}).catch(()=>{});
    return()=>controller.abort();
  },[busy]);
  if(!available)return null;
  return <details className={styles.trial}>
    <summary>首次体验：免费改一段经历</summary>
    <form onSubmit={async event=>{event.preventDefault();if(!target||busy)return;setError('');try{await onStart(target.blockId,target.excerpt);}catch(cause){setError(cause instanceof Error?cause.message:'这段暂未改好，体验次数保留，可以重试');}}}>
      <p>每个账号仅一次，限一段实习、工作或项目经历。整份修改需付费；失败不消耗体验。</p>
      {targets.length?<><label htmlFor={id}>选择要改的一段</label>
        <select id={id} value={target?.blockId||''} disabled={busy} onChange={event=>{setSelected(event.target.value);setError('');}}>
          <option value="">请选择经历</option>{targets.map(item=><option key={item.blockId} value={item.blockId}>{item.title}</option>)}
        </select>
        {target&&<p className={styles.excerpt} aria-label="本次体验的原文范围">{target.excerpt}</p>}
        <button type="submit" disabled={busy||!target}>{busy?'正在修改这一段…':'免费修改所选经历'}</button>
      </>:<p>还没识别出可单独修改的经历。请先在原稿中给实习、工作或项目加上独立标题，再来选择。</p>}
      {error&&<p role="alert">{error}</p>}
    </form>
  </details>;
}
