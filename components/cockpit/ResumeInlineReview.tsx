"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, Pencil } from "lucide-react";
import type { Opportunity } from "@/lib/opportunities/types";
import { splitResumeBlocks } from "@/lib/opportunities/resume-blocks";
import { resumeInlineProjection } from "@/lib/opportunities/resume-inline";
import { useResumeTemplate } from "@/lib/resume-template-preference";
import ResumePaper from "@/components/resume/ResumePaper";
import styles from "./ResumeInlineReview.module.css";

export default function ResumeInlineReview({ opportunity, onUpdate, onEdit, onReorder, showMarks=true }: {
  opportunity: Opportunity; onOpenEvidence?: () => void;
  onUpdate: (id: string, status: "accepted" | "rejected") => void;
  onEdit: (id: string, after: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  showMarks?: boolean;
}) {
  const [template]=useResumeTemplate();
  const [active,setActive]=useState<{id:string;left:number;top:number;bottom:number;keyboard:boolean;restoreFocus:()=>void}|null>(null);
  const [editing,setEditing]=useState(false),[value,setValue]=useState("");
  const bubble=useRef<HTMLDivElement>(null);
  const projection=useMemo(()=>resumeInlineProjection(opportunity.resumeText||"",opportunity.resumeChanges,showMarks),[opportunity.resumeText,opportunity.resumeChanges,showMarks]);
  const blockIds=useMemo(()=>{
    const original=splitResumeBlocks(opportunity.resumeText||"").map(block=>block.id);
    const shown=splitResumeBlocks(projection.text).map(block=>block.id);
    // A suggestion that creates a new section must not drag the wrong source
    // block by an index that now belongs to a different section.
    return original.length===shown.length&&original.every((id,index)=>id===shown[index])?original:[];
  },[opportunity.resumeText,projection.text]);
  const change=opportunity.resumeChanges.find(item=>item.id===active?.id&&item.status==='pending');
  useEffect(()=>{if(active?.keyboard)bubble.current?.querySelector<HTMLButtonElement>('button')?.focus();},[active]);
  useEffect(()=>{
    const close=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;if(event.type==='pointerdown'&&bubble.current?.contains(event.target as Node))return;if(event instanceof KeyboardEvent)active?.restoreFocus();setActive(null);setEditing(false);};
    window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
    return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
  },[active]);
  return <div className={styles.workbench}>
    <ResumePaper text={projection.text} template={template} title="简历 · 原位修改" showZoom review={{ink:projection.ink,blockIds,onMark:(id,rect,interaction)=>{if(active?.id!==id||interaction.keyboard){setEditing(false);setActive({id,...rect,...interaction});}},onDismiss:()=>{active?.restoreFocus();setActive(null);setEditing(false);},onReorder}}/>
    {projection.findings.length>0&&<details className={styles.unlocated}><summary>有 {projection.findings.length} 处建议无法定位，原文未变</summary>{projection.findings.map(finding=><p key={finding.changeId}>{finding.message}<button type="button" onClick={()=>onUpdate(finding.changeId!,"rejected")}>保留原文</button></p>)}</details>}
    {active&&change&&showMarks&&createPortal(<div ref={bubble} role="dialog" aria-label="处理这处修改" className={styles.bubble} style={{left:Math.max(12,Math.min(active.left,window.innerWidth-332)),top:Math.max(12,Math.min(active.bottom+8,window.innerHeight-(editing?300:150)))}}>
      <div className={styles.decisions}><button type="button" aria-label="采纳这处修改" title="采纳" onClick={()=>{active.restoreFocus();onUpdate(change.id,"accepted");setActive(null);}}><Check size={17}/></button><button type="button" aria-label="拒绝这处修改，保留原文" title="保留原文" onClick={()=>{active.restoreFocus();onUpdate(change.id,"rejected");setActive(null);}}><X size={17}/></button><button type="button" aria-label="自己修改这处文字" title="自己改" onClick={()=>{setValue(change.after);setEditing(true);}}><Pencil size={15}/></button></div>
      {editing?<form onSubmit={event=>{event.preventDefault();if(!value.trim())return;onEdit(change.id,value.trim());setEditing(false);setActive(null);}}><textarea aria-label="自己修改简历文字" rows={4} maxLength={2000} value={value} onChange={event=>setValue(event.target.value)} autoFocus/><button type="submit">保存文字</button></form>:<p>{change.reason}</p>}
    </div>,document.body)}
  </div>;
}
