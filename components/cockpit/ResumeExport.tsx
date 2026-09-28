"use client";
import {useState} from "react";
import {Check, FileDown} from "lucide-react";
import {printTemplates,renderResumePrintWindow,type PrintTemplate} from "@/lib/resume-print";
import {useResumeTemplate} from "@/lib/resume-template-preference";
import styles from "./CockpitApp.module.css";

// Visual mini-previews instead of a native <select> label list (per design ask).
// Each tile mirrors the real template: accent colour, heading rule, and typeface.
const TEMPLATE_PREVIEWS: Record<PrintTemplate, {label:string; accent:string; serif:boolean; description:string}> = {
  classic: {label:printTemplates.classic.label, accent:printTemplates.classic.accent, serif:true, description:"居中抬头 · 黑白分节"},
  modern: {label:printTemplates.modern.label, accent:printTemplates.modern.accent, serif:false, description:"侧栏标题 · 蓝灰层次"},
  warm: {label:printTemplates.warm.label, accent:printTemplates.warm.accent, serif:false, description:"暖纸底色 · 连续阅读"},
};

export default function ResumeExport({opportunityId,artifactId,baseText,disabledReason}:{opportunityId:string;artifactId?:string;baseText?:string;disabledReason?:string}){
 const [template,setTemplate]=useResumeTemplate(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function open(){
  if(disabledReason)return;
  // Open during the click, before fetching, so browsers don't block the result.
  const preview=window.open("about:blank","_blank");if(!preview){setError("预览被浏览器拦截，请允许本网站打开新窗口后重试");return;}preview.opener=null;
  preview.document.body.textContent="正在读取简历版本…";setBusy(true);setError("");
  try{let text=baseText||"";if(artifactId){const r=await fetch(`/api/coach/application-pack/pdf?opportunityId=${encodeURIComponent(opportunityId)}&artifactId=${encodeURIComponent(artifactId)}`,{cache:"no-store"});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"读取简历失败");text=b.text;}if(!text.trim())throw Error("尚无可导出的简历正文");renderResumePrintWindow(preview,text,template,artifactId?"岗位简历":"基础简历");}
  catch(e){preview.close();setError(e instanceof Error?e.message:"导出失败，请重试");}finally{setBusy(false);}
 }
 return <div className={styles.exportControls}>
  <div className={styles.exportHeading}><strong>选好版式，带走这份简历</strong><span>只换呈现，不改内容</span></div>
  <div className={styles.templatePicker} role="radiogroup" aria-label="简历版式">
   {(Object.keys(TEMPLATE_PREVIEWS) as PrintTemplate[]).map((id)=>{const t=TEMPLATE_PREVIEWS[id];return (
    <button key={id} type="button" role="radio" aria-label={t.label} aria-checked={template===id} data-active={template===id} data-template={id} className={styles.templateTile} onClick={()=>setTemplate(id)} title={t.label}>
     <span aria-hidden="true" className={styles.templatePreview} style={{fontFamily:t.serif?"serif":"sans-serif"}}>
      <b style={{color:t.accent,borderBottomColor:t.accent}}>姓名 · 联系方式</b>
      <i style={{background:t.accent}}/>
      <em/><em/><em/>
      <b style={{color:t.accent,borderBottomColor:t.accent}}>经历</b>
      <em/><em/>
     </span>
     <span className={styles.templateName}>{t.label}{template===id&&<Check size={14} aria-hidden="true"/>}</span>
     <span className={styles.templateDescription}>{t.description}</span>
    </button>
   );})}
  </div>
  <button className={`${styles.secondaryButton} ${styles.exportAction}`} disabled={busy||Boolean(disabledReason)||(!artifactId&&!baseText)} onClick={()=>void open()}><FileDown size={17} aria-hidden="true"/>{busy?"正在准备…":"预览 / 保存 PDF"}</button>
  <small>{disabledReason||"预览当前内容，在打印窗口选择「另存为 PDF」。不需要先通过 AI 检查。"}</small>
  {error&&<p role="alert">{error}</p>}
 </div>;
}
