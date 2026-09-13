import {getTokenPayCredential} from "@/lib/tokenpay";
import {CHAT_MODELS,chooseChatModel,type ChatMode} from "./chat-options";
let cache:{until:number;ids:string[]}|undefined;
export async function chatModelAccess(userId:string){
 const connected=Boolean(await getTokenPayCredential(userId));
 if(!connected)return {connected,available:[] as string[]};
 if(cache&&cache.until>Date.now())return {connected,available:cache.ids};
 try{
  const r=await fetch("https://tokendance.space/gateway/v1/models",{signal:AbortSignal.timeout(5000),cache:"no-store"});
  if(!r.ok)throw Error("catalog unavailable");
  const data=await r.json();
  if(!Array.isArray(data.data))throw Error("invalid catalog");
  const ids=data.data.filter((m:{id:string;supported_protocols?:string[]})=>CHAT_MODELS.includes(m.id as typeof CHAT_MODELS[number])&&m.supported_protocols?.includes("openai:chat-completions")).map((m:{id:string})=>m.id) as string[];
  cache={until:Date.now()+15*60*1000,ids};return {connected,available:ids};
 }catch{return {connected,available:[] as string[]};}
}
export async function resolveChatModel(userId:string,mode:ChatMode,query:string){
 const access=await chatModelAccess(userId);
 if(!access.connected&&mode!=="auto"&&mode!=="fast")throw Error("请先连接 TokenPay 才能使用该模型");
 const model=chooseChatModel(mode,query,access.available);
 if(!model)throw Error("该模型当前不可用，请改用自动或经济模式");
 return {model,connected:access.connected};
}
