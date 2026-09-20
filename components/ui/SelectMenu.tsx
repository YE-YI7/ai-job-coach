"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {CaretDown,Check} from "@phosphor-icons/react";
import styles from "./SelectMenu.module.css";

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** 自绘下拉：替换原生 <select>，保持键盘可达（方向键/Home/End/回车选中，Esc 关闭）。 */
export default function SelectMenu({value,options,onChange,ariaLabel,placeholder="请选择",disabled=false,className=""}:SelectMenuProps){
  const [open,setOpen]=useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const panelRef=useRef<HTMLDivElement>(null);
  const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const listId=useMemo(()=>`select-menu-${Math.random().toString(36).slice(2)}`,[]);

  const selectedIndex=Math.max(0,options.findIndex(o=>o.value===value));
  const current=options.find(o=>o.value===value);

  const close=useCallback((refocus:boolean)=>{setOpen(false);if(refocus)triggerRef.current?.focus();},[]);

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
      const enabledIndexes=options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
      if(!enabledIndexes.length)return;
      const focusAt=(i:number)=>optionRefs.current[i]?.focus();
      const activeIndex=enabledIndexes.find(i=>optionRefs.current[i]===document.activeElement)??selectedIndex;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();
        const dir=e.key==="ArrowDown"?1:-1;
        const pos=enabledIndexes.indexOf(activeIndex);
        focusAt(enabledIndexes[(pos+dir+enabledIndexes.length)%enabledIndexes.length]);
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

  function pick(next:string){onChange(next);close(true);}

  return <div className={`${styles.wrap} ${className}`}>
    <button ref={triggerRef} type="button" className={styles.trigger} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={()=>setOpen(o=>!o)}>
      <span className={styles.triggerText}>{current?current.label:placeholder}</span>
      <CaretDown size={14} className={styles.caret} aria-hidden="true"/>
    </button>
    {open&&<div ref={panelRef} id={listId} role="listbox" aria-label={ariaLabel} className={styles.panel}>
      {options.map((o,i)=>{
        const selected=o.value===value;
        return <button key={o.value||"__empty"} ref={el=>{optionRefs.current[i]=el;}} type="button" role="option" aria-selected={selected} disabled={o.disabled} className={`${styles.option} ${selected?styles.optionActive:""}`} onClick={()=>!o.disabled&&pick(o.value)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();if(!o.disabled)pick(o.value);}}}>
          <span className={styles.optionMain}><span className={styles.optionLabel}>{o.label}</span>{o.detail&&<span className={styles.optionDetail}>{o.detail}</span>}</span>
          {selected&&<Check size={15} className={styles.check} aria-hidden="true"/>}
        </button>;
      })}
    </div>}
  </div>;
}
