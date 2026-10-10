"use client";
import {useEffect,useState} from "react";
import {quotaActionLabel,type QuotaPool} from "@/lib/quota-label";
export default function useQuotaLabel(type:QuotaPool,busy=false){
 const [label,setLabel]=useState("费用待确认"),[version,setVersion]=useState(0);
 useEffect(()=>{const refresh=()=>setVersion(n=>n+1);window.addEventListener("yizhi-quota-changed",refresh);return()=>window.removeEventListener("yizhi-quota-changed",refresh);},[]);
 useEffect(()=>{
  if(busy)return;const controller=new AbortController();
  fetch("/api/quota/check",{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then(b=>{if(!controller.signal.aborted)setLabel(quotaActionLabel(type,b.checks?.[type]));}).catch(()=>{});
  return()=>controller.abort();
 },[type,busy,version]);
 return label;
}
