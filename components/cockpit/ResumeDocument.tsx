"use client";
import {printTemplates,type PrintTemplate} from "@/lib/resume-print";
import {useResumeTemplate} from "@/lib/resume-template-preference";
import ResumePaper from "@/components/resume/ResumePaper";
import styles from "./CockpitApp.module.css";

/** The final view and downloaded print window have one renderer, not two skins. */
export default function ResumeDocument({text}:{text:string}){
 const [template,chooseTemplate]=useResumeTemplate();
 return <div className={styles.finalDocument}>
  <div className={styles.documentTemplates} role="group" aria-label="成稿版式">
   {(Object.keys(printTemplates) as PrintTemplate[]).map(id=><button type="button" key={id} aria-pressed={template===id} onClick={()=>chooseTemplate(id)}>{printTemplates[id].label}</button>)}
  </div>
  <div className={styles.finalPaperStage}><ResumePaper text={text} template={template} title="当前简历成稿，与 PDF 使用同一正文和版式" showZoom /></div>
 </div>;
}
