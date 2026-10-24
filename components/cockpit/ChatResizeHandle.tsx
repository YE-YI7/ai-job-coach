"use client";
import {useEffect,useRef} from "react";
import {chatPanelWidth} from "@/lib/chat-panel-width";
import styles from "./CockpitApp.module.css";
export default function ChatResizeHandle(){
 const ref=useRef<HTMLDivElement>(null);
 const preferred=useRef(384);
 function applyWidth(width:number){
  const host=ref.current?.closest<HTMLElement>("[data-chat-layout]");if(!host)return;
  const next=chatPanelWidth(host.clientWidth,width,host.dataset.chatLayout==="workspace");
  host.style.setProperty("--chat-width",`${next.width}px`);
  ref.current?.setAttribute("aria-valuenow",String(Math.round(next.width)));
  ref.current?.setAttribute("aria-valuemax",String(Math.round(next.maximum)));
 }
 function resize(width:number){
  const next=Math.max(320,Math.min(760,width));
  preferred.current=next;applyWidth(next);
  try{localStorage.setItem("yi-zhi.chat-width",String(next));}catch{}
 }
 useEffect(()=>{
  try{const n=Number(localStorage.getItem("yi-zhi.chat-width"));if(n>=320&&n<=760)preferred.current=n;}catch{}
  const host=ref.current?.closest<HTMLElement>("[data-chat-layout]");if(!host)return;
  applyWidth(preferred.current);
  // 适配窄窗口，但不覆盖用户保存的宽屏偏好。
  const observer=new ResizeObserver(()=>applyWidth(preferred.current));observer.observe(host);
  return()=>observer.disconnect();
 },[]);
 return <div ref={ref} className={styles.chatResize} role="separator" tabIndex={0}
  aria-label="调整对话栏宽度，左右方向键调整，双击恢复默认宽度"
  aria-orientation="vertical" aria-valuemin={320} aria-valuemax={760} aria-valuenow={384}
  onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{
   if(e.currentTarget.hasPointerCapture(e.pointerId)){
    const box=e.currentTarget.parentElement!.getBoundingClientRect();resize(box.right-e.clientX);
   }
  }}
  onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onDoubleClick={()=>resize(384)}
  onKeyDown={e=>{
   if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;e.preventDefault();
   resize(e.key==="Home"?384:Number(e.currentTarget.getAttribute("aria-valuenow"))+(e.key==="ArrowLeft"?32:-32));
  }} />;
}
