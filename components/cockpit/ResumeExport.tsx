"use client";
import {useState} from "react";
import {printTemplates,renderResumePrintWindow,type PrintTemplate} from "@/lib/resume-print";
import styles from "./CockpitApp.module.css";
export default function ResumeExport({opportunityId,artifactId,baseText,disabledReason}:{opportunityId:string;artifactId?:string;baseText?:string;disabledReason?:string}){
 const [template,setTemplate]=useState<PrintTemplate>("classic"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function open(){
  if(disabledReason)return;
  // Open during the click, before fetching, so browsers don't block the result.
  const preview=window.open("about:blank","_blank");if(!preview){setError("预览被浏览器拦截，请允许本网站打开新窗口后重试");return;}preview.opener=null;
  preview.document.body.textContent="正在读取简历版本…";setBusy(true);setError("");
  try{let text=baseText||"";if(artifactId){const r=await fetch(`/api/coach/application-pack/pdf?opportunityId=${encodeURIComponent(opportunityId)}&artifactId=${encodeURIComponent(artifactId)}`,{cache:"no-store"});const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||"读取简历失败");text=b.text;}if(!text.trim())throw Error("尚无可导出的简历正文");renderResumePrintWindow(preview,text,template,artifactId?"岗位简历":"基础简历");}
  catch(e){preview.close();setError(e instanceof Error?e.message:"导出失败，请重试");}finally{setBusy(false);}
 }
 return <div className={styles.exportControls}><label>版式 <select aria-label="简历导出版式" value={template} onChange={e=>setTemplate(e.target.value as PrintTemplate)}>{Object.entries(printTemplates).map(([id,t])=><option key={id} value={id}>{t.label}</option>)}</select></label><button className={styles.secondaryButton} disabled={busy||Boolean(disabledReason)||(!artifactId&&!baseText)} onClick={()=>void open()}>{busy?"正在准备…":"预览 / 保存 PDF"}</button><small>{disabledReason||"导出不会改变质检或冻结状态；保存时选择「另存为 PDF」。"}</small>{error&&<p role="alert">{error}</p>}</div>;
}
