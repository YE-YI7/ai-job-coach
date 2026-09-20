"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {Waveform,SpeakerHigh} from "@phosphor-icons/react";
import styles from "./VoiceControls.module.css";

type RecognitionResult = {isFinal:boolean;0:{transcript:string}};
type Recognition = {
 lang:string;continuous:boolean;interimResults:boolean;
 onresult:((event:{results:ArrayLike<RecognitionResult>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
 start():void;stop():void;abort():void;
};
type SpeechWindow = Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
const subscribe = () => () => {};
const speechSupported = () => {const w=window as SpeechWindow;return Boolean(w.SpeechRecognition||w.webkitSpeechRecognition);};

/** Browser voice is optional. Review transcript before submitting; never auto-score partial speech. */
export default function VoiceControls({value,onChange,readText,disabled=false}:{value:string;onChange:(text:string)=>void;readText?:string;disabled?:boolean}){
 const supported=useSyncExternalStore(subscribe,speechSupported,()=>false);
 const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[error,setError]=useState("");
 const recognition=useRef<Recognition|null>(null),base=useRef(""),change=useRef(onChange);
 useEffect(()=>{change.current=onChange;},[onChange]);
 useEffect(()=>()=>{recognition.current?.abort();window.speechSynthesis?.cancel();},[]);
 useEffect(()=>{if(disabled){recognition.current?.stop();window.speechSynthesis?.cancel();}},[disabled]);
 function toggle(){
  if(listening){recognition.current?.stop();return;}
  const w=window as SpeechWindow,Constructor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Constructor)return;
  window.speechSynthesis?.cancel();setSpeaking(false);setError("");base.current=value.trim();
  const r=new Constructor();recognition.current=r;r.lang="zh-CN";r.continuous=true;r.interimResults=true;
  r.onresult=e=>{const spoken=Array.from(e.results).map(result=>result[0].transcript).join("");change.current([base.current,spoken].filter(Boolean).join("\n"));};
  r.onerror=e=>{setListening(false);setError(e.error==="not-allowed"?"麦克风未授权：请在浏览器里允许麦克风，或继续打字。":e.error==="no-speech"?"没听到声音，已有文字保留，可重试。":"语音识别未完成，已有文字保留，请重试或打字。");};
  r.onend=()=>setListening(false);
  try{r.start();setListening(true);}catch{setError("无法开启麦克风，请重试或继续打字。");}
 }
 function read(){
  if(speaking){window.speechSynthesis.cancel();setSpeaking(false);return;}
  recognition.current?.stop();setError("");
  if(!window.speechSynthesis){setError("当前浏览器不支持朗读。");return;}
  const u=new SpeechSynthesisUtterance((readText||"").replace(/[#*_`]/g,"").slice(0,5000));u.lang="zh-CN";u.rate=1;
  u.onend=()=>setSpeaking(false);u.onerror=()=>{setSpeaking(false);setError("朗读未完成，可重试。");};
  window.speechSynthesis.cancel();window.speechSynthesis.speak(u);setSpeaking(true);
 }
 const status=listening?"正在听写，停止后检查文字再提交。":supported?"语音识别结果可修改，确认后才提交。":"当前浏览器不支持语音输入，请用 Chrome / Safari 或打字。";
 return <span className={styles.wrap}>
  {error&&<span className={styles.error} role="alert">{error}</span>}
  <button type="button" className={`${styles.icon} ${listening?styles.on:""}`} disabled={disabled||!supported} aria-pressed={listening} aria-label={listening?"停止听写":"语音输入"} title={supported?(listening?"停止听写":"语音输入"):"当前浏览器不支持语音输入"} onClick={toggle}><Waveform size={16} weight={listening?"bold":"regular"}/></button>
  {readText&&<button type="button" className={`${styles.icon} ${speaking?styles.on:""}`} disabled={disabled} aria-pressed={speaking} aria-label={speaking?"停止朗读":"朗读上一条"} title={speaking?"停止朗读":"朗读上一条"} onClick={read}><SpeakerHigh size={16}/></button>}
  <span className="sr-only" role="status">{status}</span>
 </span>;
}
