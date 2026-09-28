import {guardInsufficientReply} from "./insufficiency-guard";

/** Require an explicit non-blocking envelope before exposing incremental text.
 * Legacy/unclassified replies and resume JSON remain buffered for final checks.
 */
export function createTutorStream(userText:string,emit:(text:string)=>void){
 let raw="",shown="";
 return (chunk:string)=>{
  raw+=chunk;
  // Blocking replies have their own final collapse guard; do not expose them.
  if(raw.trimStart().startsWith("<clarify"))return;
  // Conservative exact-repeat guard: three long identical suffixes are not
  // useful teaching. Stop the call rather than save/charge it as a good answer.
  for(let size=40;size<=Math.min(600,Math.floor(raw.length/3));size++){
   const tail=raw.slice(-size);
   if(tail.trim().length>=30&&raw.endsWith(tail.repeat(3)))throw Error("导师输出重复，已停止本次回答，请重试");
  }
  if(!raw.trimStart().startsWith("<answer>"))return;
  const body=raw.trimStart().slice(8).split(/<\/?(?:answer|clarify|followups)\b/i)[0];
  // Hold the unfinished sentence, including split internal markers/assertions.
  const boundary=Math.max(body.lastIndexOf("。"),body.lastIndexOf("！"),body.lastIndexOf("？"),body.lastIndexOf("\n"));
  if(boundary<0)return;
  const safe=guardInsufficientReply({answer:body.slice(0,boundary+1),userText}).answer;
  if(safe&&safe!==shown){shown=safe;emit(safe);}
 };
}

export function unwrapTutorAnswer(text:string){return text.replace(/^\s*<answer>\s*/i,"").replace(/<\/answer>/gi,"");}
