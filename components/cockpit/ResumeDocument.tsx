"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {resumePrintHtml,printTemplates,type PrintTemplate} from "@/lib/resume-print";
import {useResumeTemplate} from "@/lib/resume-template-preference";
import styles from "./CockpitApp.module.css";

/** The final view and downloaded print window have one renderer, not two skins. */
export default function ResumeDocument({text}:{text:string}){
 const [template,chooseTemplate]=useResumeTemplate();
 const [height,setHeight]=useState(800);
 const frame=useRef<HTMLIFrameElement>(null);
 const observer=useRef<ResizeObserver|null>(null);
 useEffect(()=>()=>observer.current?.disconnect(),[]);
 const html=useMemo(()=>resumePrintHtml(text,template,"当前简历成稿",{toolbar:false}),[text,template]);
 return <div className={styles.finalDocument}>
  <div className={styles.documentTemplates} role="group" aria-label="成稿版式">
   {(Object.keys(printTemplates) as PrintTemplate[]).map(id=><button type="button" key={id} aria-pressed={template===id} onClick={()=>chooseTemplate(id)}>{printTemplates[id].label}</button>)}
  </div>
  <iframe ref={frame} title="当前简历成稿，与 PDF 使用同一正文和版式" sandbox="allow-same-origin" srcDoc={html} style={{height}} onLoad={()=>{observer.current?.disconnect();const body=frame.current?.contentDocument?.body;if(body){const measure=()=>setHeight(Math.max(420,body.scrollHeight+48));measure();observer.current=new ResizeObserver(measure);observer.current.observe(body);}}}/>
 </div>;
}
