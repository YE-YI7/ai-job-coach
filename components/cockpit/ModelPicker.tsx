"use client";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {CaretDown,Check,Sparkle} from "@phosphor-icons/react";
import type {ChatMode} from "@/lib/coach-harness/chat-options";
import type {CatalogEntryAvailability} from "@/lib/coach-harness/model-catalog";
import {formatPriceRange,type ModelReferencePrice} from "@/lib/coach-harness/model-pricing";
import styles from "./ModelPicker.module.css";

interface ModelOption {
  mode: ChatMode;
  name: string;
  vendor: string;
  // Vendor logo; the synthetic auto preset uses a neutral Sparkle icon.
  logo: string;
  speedIndex: number | null;
  available: boolean;
  referencePrice?: ModelReferencePrice;
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
  const [panelOffset,setPanelOffset]=useState(0);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const panelRef=useRef<HTMLDivElement>(null);
  const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);

  const options=useMemo<ModelOption[]>(()=>{
    const presets:ModelOption[]=[
      {mode:"auto",name:"自动 · 优选模型",vendor:connected?"按问题选择，可能使用高阶模型":"使用站点模型与益职额度",logo:"",speedIndex:null,available:true},
    ];
    const cards:ModelOption[]=catalog.map(m=>({mode:m.id,name:m.name,vendor:m.vendor,logo:m.logo,speedIndex:m.speedIndex,available:m.available,referencePrice:m.referencePrice}));
    return [...presets,...cards];
  },[catalog,connected]);

  const selectedIndex=Math.max(0,options.findIndex(o=>o.mode===value));
  const current=options[selectedIndex];
  const pricingDate=options.flatMap(o=>o.referencePrice?[o.referencePrice.asOf.slice(0,10)]:[]).sort()[0];

  const close=useCallback((refocus:boolean)=>{setOpen(false);if(refocus)triggerRef.current?.focus();},[]);

  // The mentor column can be narrower than the menu. Keep the layer inside the
  // viewport without changing the column width or squeezing prices into labels.
  useLayoutEffect(()=>{
    if(!open)return;
    const position=()=>{
      const left=triggerRef.current?.getBoundingClientRect().left??0;
      const width=panelRef.current?.offsetWidth??0;
      setPanelOffset(Math.max(16-left,Math.min(0,window.innerWidth-16-left-width)));
    };
    position();window.addEventListener("resize",position);
    return()=>window.removeEventListener("resize",position);
  },[open]);

  // Focus the active card when the layer opens; keep it inside on Tab.
  useEffect(()=>{
    if(!open)return;
    const raf=requestAnimationFrame(()=>optionRefs.current[options[selectedIndex]?.available?selectedIndex:0]?.focus());
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
        : <span className={styles.triggerMark} aria-hidden="true"><Sparkle size={20}/></span>}
      <span className={styles.triggerText}><span className={styles.triggerName}>{current.name}</span></span>
      <CaretDown size={14} className={styles.caret} aria-hidden="true"/>
    </button>

    {open&&<div ref={panelRef} id="model-picker-panel" role="dialog" aria-label="选择导师模型" className={styles.panel} style={{marginLeft:panelOffset}}>
      <div className={styles.panelHeader}><p className={styles.panelTitle}>选择导师模型</p><span>¥ / 百万 tokens</span></div>
      {!connected&&<p className={styles.connectionNote}>连接 TokenPay 后可选具体模型</p>}
      <ul className={styles.list} role="listbox" aria-label="可选导师模型">
        {options.map((o,i)=>{
          const selected=o.mode===value;
          return <li key={o.mode} role="presentation">
            <button ref={el=>{optionRefs.current[i]=el;}} type="button" role="option" aria-selected={selected} disabled={!o.available} className={`${styles.card} ${selected?styles.cardActive:""}`} onClick={()=>pick(o.mode)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(o.mode);}}}>
              {o.logo
                ? <span className={`${styles.markBox} ${styles.cardMarkBox}`} aria-hidden="true"><img src={o.logo} alt="" className={styles.logo}/></span>
                : <span className={styles.mark} aria-hidden="true"><Sparkle size={22}/></span>}
              <span className={styles.cardMain}>
                <span className={styles.cardName}>{o.name}</span>
                <span className={styles.cardDetail}>{o.referencePrice?`输入 ${formatPriceRange(o.referencePrice.input)} / 输出 ${formatPriceRange(o.referencePrice.output)}`:o.vendor}</span>
              </span>
              <span className={styles.rate} title={o.referencePrice?`TokenDance 公开参考价，读取于 ${o.referencePrice.asOf.slice(0,10)}；缓存输入只适用于命中部分；实际以账单为准。`:undefined}>
                <span>{o.referencePrice?o.referencePrice.cachedInput?`缓存 ${formatPriceRange(o.referencePrice.cachedInput)}`:"无单独缓存价":"按所用模型"}</span>
                <span className={styles.speed}>{!o.available?connected?"暂不可用":"需连接":o.speedIndex!==null?`约 ${o.speedIndex.toFixed(1)}×` : "自动选择"}</span>
              </span>
              <span className={styles.check}>{selected&&<Check size={16} aria-hidden="true"/>}</span>
            </button>
          </li>;
        })}
      </ul>
      <details className={styles.disclaimer}><summary>价格与速度说明</summary><p>价格为 TokenDance 公开参考价，缓存价仅用于命中部分，实际以账单为准。速度是相对估算，千问 3.8 Max 锚定 0.7，数值越大越快；不是实测或扣费倍率。</p><p>参考价更新：{pricingDate}。<a href="https://tokendance.space/models" target="_blank" rel="noreferrer">TokenDance 价格</a> · <a href="https://huggingface.co/inference/models" target="_blank" rel="noreferrer">Hugging Face 参考</a></p></details>
    </div>}
  </div>;
}
