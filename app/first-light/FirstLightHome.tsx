"use client";

import { useEffect, useRef } from "react";
import { FIRST_LIGHT_HTML } from "./content";
import { mountFirstLight } from "./interactions";
import { trackProductEvent } from "@/lib/product-events";
import { parseEntryKind } from "@/lib/entry-doors";
import {LANDING_HANDOFF_KEY,LANDING_PREVIEW_POLICY,landingHandoffHref,readLandingHandoff,saveLandingHandoff,saveLandingPreview,
  type LandingPreview} from '@/lib/landing-handoff';
import "./first-light.css";

export default function FirstLightHome() {
  const root = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
  useEffect(() => {
    if (!root.current) return;
    // Restore the authored demo on every mount, including React Strict Mode.
    // No user account data is rendered into this subtree.
    const pending=root.current.querySelector<HTMLTextAreaElement>('#q')?.value;
    root.current.innerHTML = FIRST_LIGHT_HTML;
    const input=root.current.querySelector<HTMLTextAreaElement>('#q');
    try { if(input)input.value=pending||readLandingHandoff(sessionStorage,null)?.text||''; } catch {}
    const reply=root.current.querySelector<HTMLElement>('#entry-reply');
    const submit=root.current.querySelector<HTMLButtonElement>('#ask button[type=submit]');
    let busy=false,disposed=false;
    let request:AbortController|null=null;
    const renderReply=(preview:LandingPreview)=>{
      if(!reply)return;
      reply.hidden=false;
      const summary=document.createElement('p'),step=document.createElement('p');
      summary.textContent=preview.understanding;
      step.textContent=preview.nextStep;
      reply.replaceChildren(summary,step);
      if(submit)submit.textContent='继续和导师聊 →';
    };
    try {const saved=readLandingHandoff(sessionStorage,null);if(saved?.preview)renderReply(saved.preview);}catch{}
    const start=async(text:string)=>{
      if(busy)return;
      const status=root.current?.querySelector('#handoff-status');
      if(text.trim().length<2){input?.focus();if(status)status.textContent='先写一句你现在的困惑。';return;}
      let handoff;
      try {
        handoff=saveLandingHandoff(sessionStorage,text);
        if(handoff.preview){location.assign(landingHandoffHref());return;}
      } catch {
        if(status)status.textContent='浏览器暂时无法保留输入。请先复制这句话，再进入工作区。';
        return;
      }
      busy=true;request=new AbortController();
      const deadline=window.setTimeout(()=>request?.abort(),25_000);
      if(submit){submit.disabled=true;submit.textContent='导师正在看这句话…';}
      let preview:LandingPreview={source:'fallback',understanding:`你刚才说：「${handoff.text}」`,
        nextStep:'我先记下了。登录后，我们就从这句话接着聊。'};
      try {
        const response=await fetch('/api/landing/mentor',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message:handoff.text,requestId:handoff.id}),signal:request.signal});
        const result=await response.json();
        if(response.ok&&result.ok&&['model','fallback'].includes(result.source)&&
          typeof result.understanding==='string'&&typeof result.nextStep==='string'&&
          result.understanding.length<=1200&&result.nextStep.length<=200&&
          (result.source==='fallback'||result.policyVersion===LANDING_PREVIEW_POLICY))
          preview={source:result.source,understanding:result.understanding,nextStep:result.nextStep,
            ...(result.source==='model'?{policyVersion:LANDING_PREVIEW_POLICY}:{})};
      } catch { /* The exact input remains available without retrying a paid call. */ }
      finally {
        window.clearTimeout(deadline);busy=false;
        if(!disposed&&submit){submit.disabled=false;submit.textContent='跟我说说 →';}
      }
      if(disposed||input?.value.trim()!==handoff.text)return;
      try {saveLandingPreview(sessionStorage,handoff,preview);}catch{}
      renderReply(preview);
      if(status)status.textContent='登录后继续，这句话和回复都会带到工作区。';
    };
    const cleanup = mountFirstLight(root.current,{onStart:start,onDraft:(text:string)=>{
      if(reply)reply.hidden=true;
      if(!busy&&submit)submit.textContent='跟我说说 →';
      try {
        if(text.trim().length>=2)saveLandingHandoff(sessionStorage,text);
        else sessionStorage.removeItem(LANDING_HANDOFF_KEY);
      } catch {}
    }});
    if (!viewed.current) {
      viewed.current = true;
      trackProductEvent("landing_viewed", { surface: "home" });
    }
    return ()=>{disposed=true;request?.abort();cleanup();};
  }, []);
  return (
    <div
      data-first-light-home
      ref={root}
      onClick={(event) => {
        const target = event.target;
        const link =
          target instanceof Element ? target.closest("a[href]") : null;
        if (!(link instanceof HTMLAnchorElement)) return;
        const url = new URL(link.href);
        const kind = parseEntryKind(url.searchParams.get("entry"));
        if (
          url.origin !== location.origin ||
          url.pathname !== "/cockpit" ||
          !kind
        )
          return;
        if(kind==='one_sentence'){
          const input=root.current?.querySelector<HTMLTextAreaElement>('#q');
          if(input?.value.trim()){
            event.preventDefault();
            try {saveLandingHandoff(sessionStorage,input.value);location.assign(landingHandoffHref());}
            catch {const status=root.current?.querySelector('#handoff-status');if(status)status.textContent='请先复制这句话，再进入工作区。';}
          }
        }
        trackProductEvent("landing_task_clicked", {
          task: kind,
          placement: "first_light",
        });
      }}
      dangerouslySetInnerHTML={{ __html: FIRST_LIGHT_HTML }}
    />
  );
}
