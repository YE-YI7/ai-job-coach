export type ChatMode = "auto" | "fast" | "qwen3.8-max-0902" | "kimi-k3" | "glm-5.3";
export const CHAT_MODELS = ["qwen3.8-max-0902", "kimi-k3", "glm-5.3"] as const;
export function isChatMode(value:unknown):value is ChatMode{return typeof value==="string"&&["auto","fast",...CHAT_MODELS].includes(value);}
// Curated candidates, not an assertion of a universal leaderboard. Availability
// is checked against the gateway; a new catalog entry is not auto-trusted.
export function chooseChatModel(mode:ChatMode,query:string,available:string[]){
 if(mode==="fast")return "deepseek-v4-flash";
 if(mode!=="auto")return available.includes(mode)?mode:null;
 const preferred=/代码|架构|RAG|召回|评测/i.test(query)?"glm-5.3":/面试|谈薪|offer/i.test(query)?"kimi-k3":"qwen3.8-max-0902";
 return [preferred,...CHAT_MODELS].find(id=>available.includes(id))||"deepseek-v4-flash";
}
export function parseTutorReply(raw:string){
 const marker=raw.lastIndexOf("<followups>");
 if(marker<0)return {answer:raw.trim(),suggestions:[] as string[]};
 const answer=raw.slice(0,marker).trim();
 try{
  const items:unknown=JSON.parse(raw.slice(marker+11).split("</followups>")[0]);
  const suggestions=Array.isArray(items)?Array.from(new Set(items.filter((x):x is string=>typeof x==="string"&&x.trim().length>0&&x.length<=40).map(x=>x.trim()))).slice(0,2):[];
  return {answer,suggestions};
 }catch{return {answer,suggestions:[] as string[]};}
}
