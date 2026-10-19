"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, X, Pencil } from "lucide-react";
import type { Opportunity } from "@/lib/opportunities/types";
import { splitResumeBlocks } from "@/lib/opportunities/resume-blocks";
import { resumeInlineProjection } from "@/lib/opportunities/resume-inline";
import { editableResumeBlock } from "@/lib/opportunities/resume-edit-history";
import { useResumeTemplate } from "@/lib/resume-template-preference";
import ResumePaper from "@/components/resume/ResumePaper";
import { useResumePhoto } from "@/components/resume/useResumePhoto";
import ResumeInlineEditor from "./ResumeInlineEditor";
import { useResumeBlockDraft } from "./ResumeDraftSession";
import styles from "./ResumeInlineReview.module.css";

const editHintKey = 'yizhi:hint:inline-edit:v2';
const editingHintSeen = () => { try { return localStorage.getItem(editHintKey)==='seen'; } catch { return true; } };
const subscribeEditingHint = (notify:()=>void) => {
  const changed=(event:StorageEvent)=>{if(event.key===editHintKey||event.key===null)notify();};
  window.addEventListener('storage',changed);
  return ()=>window.removeEventListener('storage',changed);
};
const serverHintSeen = () => true;

type ResumeInlineReviewProps = {
  opportunity: Opportunity; onOpenEvidence?: () => void;
  onUpdate: (id: string, status: "accepted" | "rejected") => void;
  onEdit: (id: string, after: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  showMarks?: boolean;
  disabled?:boolean;
  onEditBlock?:(id:string,text:string,expectedText:string)=>void;
};

export default function ResumeInlineReview(props: ResumeInlineReviewProps) {
  return <ResumeInlineReviewSession key={`${props.opportunity.id}:${props.opportunity.resumeRevision || ""}`} {...props} />;
}

function ResumeInlineReviewSession({ opportunity, onUpdate, onEdit, onReorder, onEditBlock, disabled=false, showMarks=true }: ResumeInlineReviewProps) {
  const [template]=useResumeTemplate();
  const photo=useResumePhoto(opportunity.resumePhoto);
  const [active,setActive]=useState<{id:string;left:number;top:number;bottom:number;keyboard:boolean;restoreFocus:()=>void}|null>(null);
  const [editing,setEditing]=useState(false),[value,setValue]=useState("");
  const bubble=useRef<HTMLDivElement>(null);
  const [blockEdit,setBlockEdit]=useResumeBlockDraft(`${opportunity.id}:${opportunity.resumeRevision || ""}`);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [editError,setEditError]=useState('');
  const [hintDismissed,setHintDismissed]=useState(false);
  const hintSeen=useSyncExternalStore(subscribeEditingHint,editingHintSeen,serverHintSeen);
  const canEdit=Boolean(onEditBlock);
  const showHint=canEdit&&!hintSeen&&!hintDismissed;
  const dismissHint=()=>{setHintDismissed(true);try{localStorage.setItem(editHintKey,'seen');}catch{/* Still dismissed for this visit. */}};
  const [decisionNotice,setDecisionNotice]=useState<{message:string;left:number;top:number}|null>(null);
  useEffect(()=>{
    if(!decisionNotice)return;
    const clear=()=>setDecisionNotice(null);
    const timer=setTimeout(clear,2800);
    window.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
    return()=>{clearTimeout(timer);window.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
  },[decisionNotice]);
  const reportDecision=(message:string)=>{
    const rect=bubble.current?.getBoundingClientRect();
    setDecisionNotice({message,left:Math.max(12,Math.min(rect?.left||12,window.innerWidth-220)),top:Math.max(12,Math.min(rect?.top||12,window.innerHeight-60))});
  };
  const projection=useMemo(()=>resumeInlineProjection(opportunity.resumeText||"",opportunity.resumeChanges,showMarks),[opportunity.resumeText,opportunity.resumeChanges,showMarks]);
  const blockIds=useMemo(()=>{
    const original=splitResumeBlocks(opportunity.resumeText||"").map(block=>block.id);
    const shown=splitResumeBlocks(projection.text).map(block=>block.id);
    // A suggestion that creates a new section must not drag the wrong source
    // block by an index that now belongs to a different section.
    return original.length===shown.length&&original.every((id,index)=>id===shown[index])?original:[];
  },[opportunity.resumeText,projection.text]);
  const change=opportunity.resumeChanges.find(item=>item.id===active?.id&&item.status==='pending');
  const saveBlock = () => {
    if (!blockEdit || disabled) return;
    if (!blockEdit.text.trim() && !confirmDelete) { setConfirmDelete(true); return; }
    try { onEditBlock?.(blockEdit.id, confirmDelete ? '' : blockEdit.text, blockEdit.original); requestAnimationFrame(()=>blockEdit.restoreFocus?.()); setBlockEdit(null); setEditError(''); }
    catch (error) { setEditError(error instanceof Error ? error.message : '保存失败，文字仍在。'); }
  };
  useLayoutEffect(()=>{
    if(!active||!bubble.current)return;
    const height=bubble.current.getBoundingClientRect().height;
    const below=active.bottom+8;
    const top=below+height<=window.innerHeight-12?below:active.top-height-8;
    bubble.current.style.top=`${Math.max(12,Math.min(top,window.innerHeight-height-12))}px`;
  },[active,editing]);
  useEffect(()=>{if(active?.keyboard)bubble.current?.querySelector<HTMLButtonElement>('button')?.focus();},[active]);
  useEffect(()=>{
    const close=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=='Escape')return;if((event.type==='pointerdown'||event.type==='scroll')&&event.target instanceof Node&&bubble.current?.contains(event.target))return;if(event instanceof KeyboardEvent)active?.restoreFocus();setActive(null);setEditing(false);};
    window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
    return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
  },[active]);
  return <div className={styles.workbench}>
    {showHint&&!disabled&&<div className={styles.firstHint}><span>点选正文，再点“编辑”</span><button type="button" aria-label="关闭编辑提示" onClick={dismissHint}><X size={13} aria-hidden="true"/></button></div>}
    <span className={styles.decisionNotice} role="status" aria-live="polite" style={decisionNotice?{left:decisionNotice.left,top:decisionNotice.top}:undefined}>{decisionNotice?.message}</span>
    <ResumePaper text={projection.text} template={template} title="简历 · 原位修改" showZoom controlsBelow photo={photo} inlineEditor={blockEdit ? {blockId:blockEdit.id,content:<ResumeInlineEditor value={blockEdit.text} headingOnly={blockEdit.headingOnly} confirmingDelete={confirmDelete} disabled={disabled} error={editError} onChange={text=>setBlockEdit(current=>current?{...current,text}:null)} onDelete={()=>setConfirmDelete(true)} onCancel={()=>{if(confirmDelete)setConfirmDelete(false);else{requestAnimationFrame(()=>blockEdit.restoreFocus?.());setBlockEdit(null);}}} onSubmit={saveBlock}/>} : undefined} review={{ink:projection.ink,blockIds,disabled,onMark:(id,rect,interaction)=>{if(!blockEdit&&(active?.id!==id||interaction.keyboard)){setEditing(false);setActive({id,...rect,...interaction});}},onDismiss:(restoreFocus=true)=>{if(restoreFocus)active?.restoreFocus();setActive(null);setEditing(false);},onReorder,onEditBlock:onEditBlock?(id,restoreFocus)=>{if(blockEdit&&blockEdit.id!==id&&blockEdit.text!==blockEdit.original&&!window.confirm('当前段落还没有保存，放弃这次修改？'))return;const block=editableResumeBlock(opportunity,id);if(!block){setEditError('这块内容暂时无法定位，请先处理重叠建议后再编辑。');return;}dismissHint();setBlockEdit({id,original:block.text,text:block.text,headingOnly:block.headingOnly,restoreFocus});setConfirmDelete(false);setEditError('');setActive(null);}:undefined}}/>
    {editError&&!blockEdit&&<p role="alert">{editError}</p>}
    {projection.findings.length>0&&<details className={styles.unlocated}><summary>有 {projection.findings.length} 处建议无法定位，原文未变</summary>{projection.findings.map(finding=><p key={finding.changeId}>{finding.message}<button type="button" onClick={()=>onUpdate(finding.changeId!,"rejected")}>保留原文</button></p>)}</details>}
    {active&&change&&showMarks&&!disabled&&createPortal(<div ref={bubble} role="dialog" aria-label="处理这处修改" className={styles.bubble} style={{left:Math.max(12,Math.min(active.left,window.innerWidth-332)),top:Math.max(12,Math.min(active.bottom+8,window.innerHeight-(editing?300:150)))}}>
      <div className={styles.decisions}><button type="button" aria-label="采纳这处修改" title="采纳" onClick={()=>{active.restoreFocus();reportDecision('已采纳 · 可以撤销');onUpdate(change.id,"accepted");dismissHint();setActive(null);}}><Check size={16}/><span>采纳</span></button><button type="button" aria-label="拒绝这处修改，保留原文" title="保留原文" onClick={()=>{active.restoreFocus();reportDecision('已保留原文 · 可以撤销');onUpdate(change.id,"rejected");dismissHint();setActive(null);}}><X size={16}/><span>保留原文</span></button><button type="button" aria-label="自己修改这处文字" title="自己改" onClick={()=>{setValue(change.after);setEditing(true);}}><Pencil size={15}/></button></div>
      {editing?<form onSubmit={event=>{event.preventDefault();if(!value.trim())return;onEdit(change.id,value.trim());setEditing(false);setActive(null);}}><textarea aria-label="自己修改简历文字" rows={4} maxLength={2000} value={value} onChange={event=>setValue(event.target.value)} autoFocus/><button type="submit">保存文字</button></form>:<p>{change.reason}</p>}
    </div>,document.body)}
  </div>;
}
