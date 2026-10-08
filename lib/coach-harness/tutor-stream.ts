import {
  GUARD_SLOTS,
  REPETITION_GUARD_ID,
  SENTENCE_GUARD_ID,
  registerDefaultGuards,
  runSlot,
  type Slot2Input,
} from "./guard-slots";

/** Require an explicit non-blocking envelope before exposing incremental text.
 * Legacy/unclassified replies and resume JSON remain buffered for final checks.
 */
export function createTutorStream(userText:string,emit:(text:string)=>void){
 let raw="",shown="";
 // 槽2 的两条守卫经注册表执行；本模块自己补一次幂等装配，runSlot 才不会跑在空表上。
 registerDefaultGuards();
 return (chunk:string)=>{
  raw+=chunk;
  // Blocking replies have their own final collapse guard; do not expose them.
  if(raw.trimStart().startsWith("<clarify"))return;
  const body=raw.trimStart().startsWith("<answer>")
   ? raw.trimStart().slice(8).split(/<\/?(?:answer|clarify|followups|outcome)\b/i)[0]
   : undefined;
  // Hold the unfinished sentence, including split internal markers/assertions.
  const boundary=body?Math.max(body.lastIndexOf("。"),body.lastIndexOf("！"),body.lastIndexOf("？"),body.lastIndexOf("\n")):-1;
  const checks=runSlot<Slot2Input>(GUARD_SLOTS.streamingSentence,{
   raw,
   sentence:boundary>=0&&body?{text:body.slice(0,boundary+1),userText}:undefined,
  });
  // Conservative exact-repeat guard: three long identical suffixes are not useful
  // teaching. Stop the call rather than save/charge it as a good answer; the abort
  // copy comes from the guard, so it lands in the failure-semantics table verbatim.
  const repeat=checks.find((decision)=>decision.guardId===REPETITION_GUARD_ID);
  if(repeat?.outcome==="block")throw Error(repeat.reason.message);
  if(!body||boundary<0)return;
  // 逐句守卫只收敛这一句的文本，不抛：抛出会让整轮作废，与迁移前逐字同行为。
  const safe=(checks.find((decision)=>decision.guardId===SENTENCE_GUARD_ID)?.data as {answer?:string}|undefined)?.answer;
  if(typeof safe==="string"&&safe&&safe!==shown){shown=safe;emit(safe);}
 };
}

export function unwrapTutorAnswer(text:string){return text.replace(/^\s*<answer>\s*/i,"").replace(/<\/answer>/gi,"");}
