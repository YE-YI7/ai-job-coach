"use client";
import {useRef,useState} from "react";
import {FileDown} from "lucide-react";
import {renderResumePrintWindow} from "@/lib/resume-print";
import {resumePhotoDataUri, type ResumePhoto} from "@/lib/resume-photo";
import {useResumeTemplate} from "@/lib/resume-template-preference";
import {trackProductEvent} from "@/lib/product-events";
import styles from "./CockpitApp.module.css";
import ResumeTemplatePicker from "./ResumeTemplatePicker";

export default function ResumeExport({opportunityId,artifactId,baseText,disabledReason,compact=false,pendingCount=0,photo}:{opportunityId:string;artifactId?:string;baseText?:string;disabledReason?:string;compact?:boolean;pendingCount?:number;photo?:ResumePhoto}){
 const [template,setTemplate]=useResumeTemplate(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const confirmation=useRef<HTMLDialogElement>(null);
 async function open(){
  if(disabledReason||busy)return;
  const track=(name:"resume_preview_ready"|"resume_preview_failed"|"resume_print_requested")=>{if(/^[0-9a-f-]{36}$/i.test(opportunityId))trackProductEvent(name,{opportunity_id:opportunityId,template,version_source:artifactId?"artifact":"current_text"});};
  // Open during the click, before fetching, so browsers don't block the result.
  const preview=window.open("about:blank","_blank");if(!preview){track("resume_preview_failed");setError("预览被浏览器拦截，请允许本网站打开新窗口后重试");return;}preview.opener=null;
  preview.document.body.textContent="正在读取简历版本…";setBusy(true);setError("");
  try{let text=baseText||"";if(artifactId){const r=await fetch(`/api/coach/application-pack/pdf?opportunityId=${encodeURIComponent(opportunityId)}&artifactId=${encodeURIComponent(artifactId)}`,{cache:"no-store"});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"读取简历失败");text=b.text;}if(!text.trim())throw Error("尚无可导出的简历正文");const photoDataUri=photo?.path?await resumePhotoDataUri(photo.path):undefined;renderResumePrintWindow(preview,text,template,artifactId?"岗位简历":"基础简历",()=>track("resume_print_requested"),photoDataUri);track("resume_preview_ready");}
  catch(e){track("resume_preview_failed");preview.close();setError(e instanceof Error?e.message:"导出失败，请重试");}finally{setBusy(false);}
 }
 return <div className={`${styles.exportControls} ${compact?styles.exportCompact:""}`}>
  {!compact&&<>
  <div className={styles.exportHeading}><strong>选好版式，带走这份简历</strong><span>只换呈现，不改内容</span></div>
  <ResumeTemplatePicker value={template} onChange={setTemplate} inline />
  </>}
  <button className={`${styles.secondaryButton} ${styles.exportAction}`} title={disabledReason||"预览简历并保存 PDF"} disabled={busy||Boolean(disabledReason)||(!artifactId&&!baseText)} onClick={()=>pendingCount?confirmation.current?.showModal():void open()}><FileDown size={16} aria-hidden="true"/>{busy?"正在准备…":compact?"导出 PDF":"预览 / 保存 PDF"}</button>
  <dialog ref={confirmation} className={styles.resumeExportConfirmation} aria-labelledby={`resume-export-confirm-${opportunityId}`}><h2 id={`resume-export-confirm-${opportunityId}`}>导出这份修改稿？</h2><p>还有 {pendingCount} 处修改未逐一确认。要导出的话，按我们最后给你修改的版本导出，你同不同意？</p><p>已拒绝的修改不会重新采用，导出不会替你更改采纳状态。</p><div><button type="button" onClick={()=>confirmation.current?.close()}>继续核对</button><button type="button" onClick={()=>{confirmation.current?.close();void open();}}>同意并导出</button></div></dialog>
  {(!compact||disabledReason)&&<small>{disabledReason||"在打印窗口选择「另存为 PDF」。"}</small>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
