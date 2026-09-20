"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {CaretDown,Check,Gauge} from "@phosphor-icons/react";
import type {ChatMode} from "@/lib/coach-harness/chat-options";
import {TIER_LABEL,speedFraction,type CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import styles from "./ModelPicker.module.css";

interface ModelOption {
  mode: ChatMode;
  name: string;
  vendor: string;
  monogram: string;
  color: string;
  // Official brand logo path; empty for the synthetic "auto" preset, which
  // falls back to the monogram chip.
  logo: string;
  tier: keyof typeof TIER_LABEL;
  speedIndex: number | null;
  available: boolean;
}

interface ModelPickerProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
  // Enriched catalog from /api/coach/agent/models (`catalog` field). Each entry
  // already carries the live gateway availability flag.
  catalog: CatalogEntryAvailability[];
  connected: boolean;
  disabled?: boolean;
}

export default function ModelPicker({value,onChange,catalog,connected,disabled=false}:ModelPickerProps){
  const [open,setOpen]=useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const panelRef=useRef<HTMLDivElement>(null);
  const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);

  const options=useMemo<ModelOption[]>(()=>{
    const presets:ModelOption[]=[
      // "auto" is synthetic (a pool, not one vendor) so it keeps the monogram chip.
      {mode:"auto",name:"自动 · 优选模型",vendor:connected?"按问题挑选 · 可能调用高阶模型":"未连接 TokenPay · 托管经济模型",monogram:"A",color:"#8a8277",logo:"",tier:"auto",speedIndex:null,available:true},
      {mode:"fast",name:"经济 · DeepSeek V4 Flash",vendor:"DeepSeek · 最低成本档",monogram:"D",color:"#5b7cfa",logo:"/models/deepseek.svg",tier:"cheap",speedIndex:1.0,available:true},
    ];
    const cards:ModelOption[]=catalog.map(m=>({mode:m.id,name:m.name,vendor:m.vendor,monogram:m.monogram,color:m.color,logo:m.logo,tier:m.tier,speedIndex:m.speedIndex,available:m.available}));
    return [...presets,...cards];
  },[catalog,connected]);

  const selectedIndex=Math.max(0,options.findIndex(o=>o.mode===value));
  const current=options[selectedIndex];

  const close=useCallback((refocus:boolean)=>{setOpen(false);if(refocus)triggerRef.current?.focus();},[]);

  // Focus the active card when the layer opens; keep it inside on Tab.
  useEffect(()=>{
    if(!open)return;
    const raf=requestAnimationFrame(()=>optionRefs.current[selectedIndex]?.focus());
    return()=>cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){e.preventDefault();close(true);return;}
      const enabledIndexes=options.map((o,i)=>o.available?i:-1).filter(i=>i>=0);
      if(!enabledIndexes.length)return;
      const focusAt=(i:number)=>optionRefs.current[i]?.focus();
      const activeIndex=enabledIndexes.find(i=>optionRefs.current[i]===document.activeElement)??selectedIndex;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();
        const dir=e.key==="ArrowDown"?1:-1;
        const pos=enabledIndexes.indexOf(activeIndex);
        const next=enabledIndexes[(pos+dir+enabledIndexes.length)%enabledIndexes.length];
        focusAt(next);
      }else if(e.key==="Home"){e.preventDefault();focusAt(enabledIndexes[0]);}
      else if(e.key==="End"){e.preventDefault();focusAt(enabledIndexes.at(-1)!);}
    };
    const onPointerDown=(e:PointerEvent)=>{
      const t=e.target as Node;
      if(panelRef.current?.contains(t)||triggerRef.current?.contains(t))return;
      close(false);
    };
    document.addEventListener("keydown",onKey);
    document.addEventListener("pointerdown",onPointerDown,true);
    return()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("pointerdown",onPointerDown,true);};
  },[open,options,selectedIndex,close]);

  function pick(mode:ChatMode){onChange(mode);close(true);}

  return <div className={styles.wrap}>
    <button ref={triggerRef} type="button" className={styles.trigger} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls="model-picker-panel" onClick={()=>setOpen(o=>!o)} title="选择导师模型">
      {current.logo
        ? <span className={styles.markBox} aria-hidden="true"><img src={current.logo} alt="" className={styles.triggerLogo}/></span>
        : <span className={styles.triggerMark} style={{background:current.color}} aria-hidden="true">{current.monogram}</span>}
      <span className={styles.triggerText}><span className={styles.triggerName}>{current.name}</span><span className={styles.triggerHint}>{current.speedIndex!==null?`速率 ≈${current.speedIndex.toFixed(1)} · ${TIER_LABEL[current.tier]}`:current.vendor}</span></span>
      <CaretDown size={14} className={styles.caret} aria-hidden="true"/>
    </button>

    {open&&<div ref={panelRef} id="model-picker-panel" role="dialog" aria-label="选择导师模型" className={styles.panel}>
      <p className={styles.panelTitle}>选择导师模型</p>
      <ul className={styles.list} role="listbox" aria-label="可选导师模型">
        {options.map((o,i)=>{
          const selected=o.mode===value;
          return <li key={o.mode} role="presentation">
            <button ref={el=>{optionRefs.current[i]=el;}} type="button" role="option" aria-selected={selected} disabled={!o.available} className={`${styles.card} ${selected?styles.cardActive:""}`} onClick={()=>pick(o.mode)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(o.mode);}}}>
              {o.logo
                ? <span className={`${styles.markBox} ${styles.cardMarkBox}`} aria-hidden="true"><img src={o.logo} alt="" className={styles.logo}/></span>
                : <span className={styles.mark} style={{background:o.color}} aria-hidden="true">{o.monogram}</span>}
              <span className={styles.cardMain}>
                <span className={styles.cardTop}><span className={styles.cardName}>{o.name}</span><span className={styles.tier} data-tier={o.tier}>{TIER_LABEL[o.tier]}</span></span>
                {!o.available&&<span className={styles.note}>该模型当前不在网关可用列表中，或需先连接 TokenPay。</span>}
                {o.speedIndex!==null&&<span className={styles.speed} aria-hidden="true"><Gauge size={12}/><span className={styles.speedBar}><span className={styles.speedFill} style={{width:`${speedFraction(o.speedIndex)*100}%`}}/></span><span className={styles.speedVal}>速率 ≈{o.speedIndex.toFixed(1)}</span></span>}
              </span>
              {selected&&<Check size={16} className={styles.check} aria-hidden="true"/>}
            </button>
          </li>;
        })}
      </ul>
      <p className={styles.disclaimer}>名称、厂商标识与“速率/档位”均为参考估算，非官方扣费倍率；实际价格与用量请以 <a href="https://tokendance.space/models" target="_blank" rel="noreferrer">TokenPay 实时价格（以账单为准）</a> 为准。</p>
    </div>}
  </div>;
}
