"use client";
import {useEffect,useId,useMemo,useRef,useState} from "react";
import Image from "next/image";
import {CaretDown,Check,Sparkle} from "@phosphor-icons/react";
import type {ChatMode} from "@/lib/coach-harness/chat-options";
import type {CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import {formatPriceRange,type ModelReferencePrice} from "@/lib/coach-harness/model-pricing";
import {nextModelOption,type ModelNavigationKey} from "./model-picker-navigation";
import styles from "./ModelPicker.module.css";

type Option={mode:ChatMode;name:string;logo:string;available:boolean;detail:string;speedIndex:number|null;price?:ModelReferencePrice};
export default function ModelPicker({value,onChange,catalog,connected,disabled=false}:{value:ChatMode;onChange:(mode:ChatMode)=>void;catalog:CatalogEntryAvailability[];connected:boolean;disabled?:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),rows=useRef<(HTMLButtonElement|null)[]>([]);
 const [open,setOpen]=useState(false),[focused,setFocused]=useState(0);
 const options=useMemo<Option[]>(()=>[
  {mode:"auto",name:"自动 · 优选模型",logo:"",available:true,detail:connected?"按问题选择可用模型":"使用站点模型与益职额度",speedIndex:null},
  {mode:"fast",name:"实惠档 · 站点模型",logo:"",available:true,detail:"固定使用实惠档",speedIndex:null},
  ...catalog.map(m=>({mode:m.id,name:m.name,logo:m.logo,available:m.available,detail:m.vendor,speedIndex:m.speedIndex,price:m.referencePrice})),
 ],[catalog,connected]);
 const selected=Math.max(0,options.findIndex(o=>o.mode===value)),current=options[selected];
 const priceDate=options.flatMap(o=>o.price?[o.price.asOf.slice(0,10)]:[]).sort()[0];

 useEffect(()=>{
  const element=panel.current;if(!element)return;
  const sync=(event:Event)=>setOpen((event as ToggleEvent).newState==="open");
  const dismiss=(event:Event)=>{if(!(event.target instanceof Node)||!element.contains(event.target))element.hidePopover();};
  element.addEventListener("toggle",sync);window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
  return()=>{element.removeEventListener("toggle",sync);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);};
 },[]);
 useEffect(()=>{if(disabled)panel.current?.hidePopover();},[disabled]);
 function close(refocus=false){panel.current?.hidePopover();if(refocus)trigger.current?.focus({preventScroll:true});}
 function show(){
  const element=panel.current,button=trigger.current;if(!element||!button||disabled)return;
  (element.showPopover as (options:{source:HTMLElement})=>void).call(element,{source:button});
  const rect=button.getBoundingClientRect(),{width,height}=element.getBoundingClientRect();
  const above=rect.top-height-8,preferAbove=above>=12||rect.top>=window.innerHeight-rect.bottom;
  element.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
  element.style.top=`${Math.max(12,Math.min(preferAbove?above:rect.bottom+8,window.innerHeight-height-12))}px`;
  const next=options[selected]?.available?selected:0;setFocused(next);
  rows.current[next]?.focus({preventScroll:true});rows.current[next]?.scrollIntoView({block:"nearest"});
 }
 function toggle(){if(panel.current?.matches(":popover-open"))close(true);else show();}
 function move(key:ModelNavigationKey){
  const active=rows.current.findIndex(row=>row===document.activeElement),next=nextModelOption(options.map(o=>o.available),active<0?focused:active,key);if(next===null)return;
  rows.current[next]?.focus({preventScroll:true});rows.current[next]?.scrollIntoView({block:"nearest"});
 }
 const mark=(option:Option)=>option.logo?<Image src={option.logo} alt="" width={18} height={18} unoptimized draggable={false}/>:<Sparkle size={18} aria-hidden="true"/>;
 return <div className={styles.wrap}>
  <button ref={trigger} type="button" className={styles.trigger} disabled={disabled} aria-label={`选择导师模型：${current.name}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} popoverTarget={id} popoverTargetAction="toggle" onClick={event=>{event.preventDefault();toggle();}} onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();show();}}}>
   <span className={styles.mark} aria-hidden="true">{mark(current)}</span><span className={styles.triggerName}>{current.name}</span><CaretDown size={13} aria-hidden="true"/>
  </button>
  <div ref={panel} id={id} popover="auto" role="dialog" aria-label="选择导师模型" className={styles.panel} onBlur={event=>{const target=event.relatedTarget;if(target instanceof Node&&!event.currentTarget.contains(target)&&!trigger.current?.contains(target))close();}} onKeyDown={event=>{
   if(event.key==="Escape"){event.preventDefault();close(true);}
   else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)&&(event.target as HTMLElement).getAttribute("role")==="option"){event.preventDefault();move(event.key as ModelNavigationKey);}
  }}>
   <div className={styles.heading}><strong>选择导师模型</strong><span>¥ / 百万 tokens</span></div>
   <ul className={styles.list} role="listbox" aria-label="可选导师模型">
    {options.map((o,i)=><li key={o.mode} role="presentation"><button ref={element=>{rows.current[i]=element;}} type="button" role="option" aria-selected={o.mode===value} disabled={!o.available} tabIndex={focused===i?0:-1} onFocus={()=>setFocused(i)} className={styles.option} onClick={()=>{if(o.available&&!disabled){onChange(o.mode);close(true);}}}>
     <span className={styles.mark} aria-hidden="true">{mark(o)}</span>
     <span className={styles.main}><span className={styles.name} title={o.name}>{o.name}</span><span className={styles.detail}>{o.price?`输入 ${formatPriceRange(o.price.input)} / 输出 ${formatPriceRange(o.price.output)}`:o.detail}</span></span>
     <span className={styles.rate}>{!o.available?<span>暂不可用</span>:o.price?<><span>{o.price.cachedInput?`缓存 ${formatPriceRange(o.price.cachedInput)}`:"无单独缓存价"}</span><span>{o.speedIndex!==null?`约 ${o.speedIndex.toFixed(1)}×`:""}</span></>:<span>按所用模型</span>}</span>
     <span className={styles.check} aria-hidden="true">{o.mode===value&&<Check size={14}/>}</span>
    </button></li>)}
   </ul>
   <details className={styles.note}><summary>价格与速度说明</summary><p>具体模型按输出参考价从高到低排列，同价比较输入价；预设单独置顶。缓存价仅适用于命中部分，实际以账单为准。速度为相对估算，非实测或扣费倍率。</p><p>参考价读取于 {priceDate||"未记录"}。选择模型不会自动发送。</p></details>
  </div>
 </div>;
}
