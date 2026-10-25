import type {ResumeAgentAnswer} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

/** Directions are not autobiographical evidence. This never routes a message
 * to the editor: that decision still belongs to the mentor. */
export function isResumeEditingDirection(text:string){
  const value=text.trim().replace(/[。！!，,\s]+$/g,'');
  return /^(?:可以|好(?:的)?|行|就这样|同意|你觉得呢|交给你(?:了)?|可以交给你(?:了)?|你来(?:定|改|决定)|按这个(?:方向|方案)(?:改|来)?)$/.test(value)
    || /^(?:还是要|还是|就|要)?往.{0,20}(?:产品经理|求职|岗位).{0,10}(?:吧|改|靠|方向|那儿|那里)$/.test(value)
    || /^(?:保持|保留)(?:一个|目前|现在|现有|原来|简单的?)*[的]*(?:现状|顺序|结构|一个简单的现状)$/.test(value);
}

/** Prior facts remain available, but a newer instruction starts a new goal. */
export function resumeAnswersForCurrentRequest(answers:ResumeAgentAnswer[]){
  let lastInstruction=-1;
  for(let index=answers.length-1;index>=0;index--)if(answers[index].kind==='instruction'){lastInstruction=index;break;}
  return answers.slice(lastInstruction+1).filter(answer=>!isResumeEditingDirection(answer.answer));
}

/** Source-checked carryovers are rechecked and independently reviewed. */
export function carryResumeProposals(proposals:Record<string,unknown>[],grounded:ResumeChange[],locked:ResumeChange[]){
  const raw=(change:ResumeChange)=>({section:change.section,before:change.before,after:change.after,
    reason:change.reason,sourceIds:change.evidenceIds||[]});
  const lockedBefore=new Set(locked.map(change=>change.before));
  const next=proposals.filter(item=>!lockedBefore.has(String(item.before||'').trim()));
  const present=new Set([...lockedBefore,...next.map(item=>String(item.before||'').trim())]);
  return [...locked.map(raw),...next,...grounded.filter(change=>!present.has(change.before)).map(raw)].slice(0,6);
}

export function resumeDeliverySummary(changes:ResumeChange[],unresolvedSections:string[]=[]){
  const names=(values:string[])=>[...new Set(values)].filter(name=>name&&name.length<=60&&!/@|https?:|\d{11}/.test(name)).slice(0,6);
  const sections=names(changes.map(change=>change.section)),unresolved=names(unresolvedSections);
  return `本轮生成了 ${changes.length} 处待确认建议${sections.length?`（${sections.join('、')}）`:''}，采纳后才会替换原文。`
    +(unresolved.length?`${unresolved.join('、')}尚未完成，仍保留原文；不是判断无需修改。`:'');
}

export type ResumeRequestCoverage={status:'complete'|'partial'|'not_addressed'|'unverified';unaddressed:string[];summary:string};
export function readResumeRequestCoverage(raw:unknown):ResumeRequestCoverage{
  const value=raw as Partial<ResumeRequestCoverage>|null;
  if(value&&['complete','partial','not_addressed'].includes(String(value.status))
    &&typeof value.summary==='string'&&value.summary.trim().length>=8
    &&Array.isArray(value.unaddressed)&&value.unaddressed.every(item=>typeof item==='string'&&item.length<=100)
    &&(value.status==='complete'?value.unaddressed.length===0:value.unaddressed.length>0))return value as ResumeRequestCoverage;
  return {status:'unverified',unaddressed:['本轮修改要求'],summary:'本轮修改要求的完成情况尚未通过核对，不能宣称已经全部完成。'};
}

export const RESUME_REQUEST_REVIEW_PROMPT='同时核对 editingRequest：它是本轮用户已确认的修改目标，不是经历事实。检查最终候选是否真正完成这些目标，而不只检查有没有错字或单条事实正确。返回 requestCoverage:{status:"complete|partial|not_addressed",unaddressed:["尚未完成的具体段落或目标"],summary:"依据"}；只改旁边一条不能算完成开头定位或多段内容调整。已完成时 unaddressed 为空，不以新增事实或编造成果来凑覆盖。这个判断不代替任何事实、价值或整稿检查。';
