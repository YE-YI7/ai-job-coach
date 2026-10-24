"use client";

import { useEffect,useMemo,useState,useSyncExternalStore } from "react";
import {LANDING_HANDOFF_KEY,claimLandingHandoff,completeLandingHandoff,readLandingHandoff} from '@/lib/landing-handoff';
import TutorMarkdown from './TutorMarkdown';
import AgentConversation, { type CoachingStart } from "./AgentConversation";
import CurrentArrangement from "./CurrentArrangement";

const handoffEvent='yizhi-landing-handoff';
const subscribe=(callback:()=>void)=>{
  window.addEventListener('storage',callback);window.addEventListener(handoffEvent,callback);
  return ()=>{window.removeEventListener('storage',callback);window.removeEventListener(handoffEvent,callback);};
};
const snapshot=()=>{
  try {return new URL(location.href).searchParams.get('handoff')==='1'?sessionStorage.getItem(LANDING_HANDOFF_KEY)||'':'';}
  catch {return '';}
};
const emptySnapshot=()=>'';
const readySubscribe=()=>()=>{};

/** The conversation stays mounted after consuming its one-shot trigger. */
export default function CompanionStart({ onResume, onInterview,scope,fixture=false }: {
  onResume: () => void;
  onInterview: () => void;
  scope:string;
  fixture?:boolean;
}) {
  const [request, setRequest] = useState<CoachingStart | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const ready=useSyncExternalStore(readySubscribe,()=>true,()=>false);
  const raw=useSyncExternalStore(subscribe,snapshot,emptySnapshot);
  const handoff=useMemo(()=>raw?readLandingHandoff({getItem:()=>raw},null,scope):null,[raw,scope]);
  useEffect(()=>{
    if(!handoff||handoff.owner)return;
    try {
      claimLandingHandoff(sessionStorage,handoff.id,scope);
      window.dispatchEvent(new Event(handoffEvent));
    }
    catch { /* The visible input remains editable if storage is unavailable. */ }
  },[handoff,scope]);
  if(!ready)return <p role="status">正在接回你的输入…</p>;
  return <div>
    {handoff&&<section aria-label="从首页接着聊">
      <p>刚才的输入已带过来，可以继续补充。</p>
      {handoff.preview?.source==='model'&&<><TutorMarkdown>{handoff.preview.understanding}</TutorMarkdown>
        <TutorMarkdown>{handoff.preview.nextStep}</TutorMarkdown></>}
    </section>}
    <CurrentArrangement
      key={scope}
      fixture={fixture}
      initialText={handoff?.text}
      onOpened={()=>{
        try {if(handoff)completeLandingHandoff(sessionStorage,handoff.id,scope);
          window.dispatchEvent(new Event(handoffEvent));}catch{}
      }}
      onOpenResume={onResume}
      onOpenInterview={onInterview}
      onAskMentor={(prompt, id) => {
        setRequest({ id, title: "当前安排", prompt,newSession:Boolean(handoff) });
        setChatOpen(true);
      }}
    />
    {chatOpen && <AgentConversation key={scope}
      label="当前安排"
      startRequest={request}
      onStartConsumed={() => setRequest(null)}
    />}
  </div>;
}
