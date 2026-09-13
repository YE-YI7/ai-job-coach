"use client";
import {useEffect,useRef} from "react";
import styles from "./CockpitApp.module.css";
export default function ChatResizeHandle(){
 const ref=useRef<HTMLDivElement>(null);
 function resize(width:number){
  const host=ref.current?.closest<HTMLElement>("[data-chat-layout]");if(!host)return;
  const reserve=host.dataset.chatLayout==="workspace"?578:420;
  const next=Math.max(320,Math.min(760,host.clientWidth-reserve,width));
  host.style.setProperty("--chat-width",`${next}px`);ref.current?.setAttribute("aria-valuenow",String(Math.round(next)));
  try{localStorage.setItem("yi-zhi.chat-width",String(next));}catch{}
 }
 useEffect(()=>{try{const n=Number(localStorage.getItem("yi-zhi.chat-width"));if(n>=320)resize(n);}catch{}},[]);
 return <div ref={ref} className={styles.chatResize} role="separator" tabIndex={0} aria-label="调整对话栏宽度，左右方向键调整" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={760} aria-valuenow={480}
  onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const box=e.currentTarget.parentElement!.getBoundingClientRect();resize(box.right-e.clientX);}}}
  onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onDoubleClick={()=>resize(480)}
  onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;e.preventDefault();resize(e.key==="Home"?480:Number(e.currentTarget.getAttribute("aria-valuenow"))+(e.key==="ArrowLeft"?32:-32));}} />;
}
