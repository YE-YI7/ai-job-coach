import {getTokenPayCredential} from "@/lib/tokenpay";
import {chooseChatModel,type ChatMode} from "./chat-options";
import {intersectSelectable,intersectHostedChat} from "./model-catalog";
let cache:{until:number;ids:string[];hosted:string[]}|undefined;
const coolingUntil=new Map<string,number>();
export function coolDownChatModel(model:string){coolingUntil.set(model,Date.now()+60000);}
// Explicit selections never authorize a different model or billing tier.
export function pickHostedOrFallback(
  requested: string,
  hosted: string[],
): { model: string; substituted: boolean } {
  if (hosted.includes(requested)) return { model: requested, substituted: false };
  throw new Error(`TokenPay 模型「${requested}」当前不可用，未替换模型。请选择其他模型后重试。`);
}
export async function chatModelAccess(userId:string){
 const connected=Boolean(await getTokenPayCredential(userId));
 if(!connected)return {connected,available:[] as string[],hosted:[] as string[]};
 if(cache&&cache.until>Date.now())return {connected,available:cache.ids,hosted:cache.hosted};
 try{
  const r=await fetch("https://tokendance.space/gateway/v1/models",{signal:AbortSignal.timeout(5000),cache:"no-store"});
  if(!r.ok)throw Error("catalog unavailable");
  const data=await r.json();
  if(!Array.isArray(data.data))throw Error("invalid catalog");
  // `available` = curated ids the picker offers; `hosted` = everything the
  // gateway can actually call, so substitution decisions are not limited to the
  // curated list. A gateway model we do not surface stays out of `available`.
  const hosted=intersectHostedChat(data.data);
  const ids=intersectSelectable(data.data);
  cache={until:Date.now()+15*60*1000,ids,hosted};return {connected,available:ids,hosted};
 }catch{return {connected,available:[] as string[],hosted:[] as string[]};}
}
// Catalog failure is not proof of absence: preserve the requested model and let
// the gateway decide. A confirmed absence fails visibly without another charge.
export async function resolveTokenDanceModel(userId:string,requested:string){
 const {hosted}=await chatModelAccess(userId);
 if(hosted.length===0)return requested; // catalog unreachable: never invent a swap
 const {model}=pickHostedOrFallback(requested,hosted);
 return model;
}
export async function resolveChatModel(userId:string,mode:ChatMode,query:string){
 const access=await chatModelAccess(userId);
 if(!access.connected&&mode!=="auto"&&mode!=="fast")throw Error("请先连接 TokenPay 才能使用该模型");
 const available=mode==="auto"?access.available.filter(id=>(coolingUntil.get(id)||0)<=Date.now()):access.available;
 const model=chooseChatModel(mode,query,available);
 if(!model)throw Error("该模型当前不可用，请改用自动或经济模式");
 return {model,connected:access.connected};
}
