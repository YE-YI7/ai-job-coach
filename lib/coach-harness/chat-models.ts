import {getTokenPayCredential} from "@/lib/tokenpay";
import {chooseChatModel,type ChatMode} from "./chat-options";
import {intersectSelectable,intersectHostedChat,findModel,isSelectableModelId} from "./model-catalog";
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
// A system-default economy model disappearing from the catalog may only degrade
// to another CHEAP-tier model — never an expensive one (e.g. deepseek-v4-pro).
// Returning null means "no same-tier substitute": the caller must fail visibly
// instead of silently billing a higher tier.
export function pickEconomySubstitute(hosted: string[]): string | null {
  const cheap = hosted.filter((id) => isSelectableModelId(id) && findModel(id)?.tier === "cheap");
  return cheap.find((id) => /flash/i.test(id)) ?? cheap[0] ?? null;
}
// Server-side default ids (env LLM_MODEL_CHAT, the fast preset) can never have
// been clicked in the picker — the UI only offers selectable ids — so they are
// allowed to degrade, but only within the same vendor family first and only to
// a cheap-tier model. An explicit (selectable) pick is still never rewritten.
export function pickSystemDefaultSubstitute(requested: string, hosted: string[]): string | null {
  const family = requested.split("-")[0];
  const sameFamily = family ? hosted.filter((id) => id.startsWith(`${family}-`)) : [];
  return pickEconomySubstitute(sameFamily) ?? pickEconomySubstitute(hosted);
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
// USER-EXPlicit picks are never silently rewritten. System-default ids
// (ECONOMY_MODEL_ID, env LLM_MODEL_CHAT, hosted fallbacks callers never chose)
// may degrade to a cheap model the gateway actually serves — otherwise a
// catalog rename blocks the whole cockpit for TokenPay users who never
// selected a model.
export async function resolveTokenDanceModel(userId:string,requested:string){
 const {hosted}=await chatModelAccess(userId);
 if(hosted.length===0)return requested; // catalog unreachable: never invent a swap
 if(hosted.includes(requested))return requested;
 if(!isSelectableModelId(requested)){
  const substitute=pickSystemDefaultSubstitute(requested,hosted);
  if(substitute){
   console.warn(`服务端默认模型「${requested}」不在网关目录，按同档可用模型「${substitute}」执行（用户从未经手这个 id）`);
   return substitute;
  }
  // No cheap substitute exists: do NOT silently bill an expensive model.
  throw new Error(`默认模型「${requested}」当前不可用，且没有实惠档模型可替换；未擅自改用高阶模型，请改用自动模式或在模型选择中手动更换。`);
 }
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
