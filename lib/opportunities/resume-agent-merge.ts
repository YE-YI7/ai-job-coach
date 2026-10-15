import type { ResumeChange } from './types';
import { resolveResumeEdits } from '../coach-harness/application-quality';

/** 再改一轮也不能悄悄推翻用户已经采纳或拒绝的片段。 */
export function mergeResumeAgentChanges(source:string,previous:ResumeChange[],proposed:ResumeChange[],reopenedSources:string[]=[]){
  const decided=previous.filter(change=>change.status!=='pending');
  const anchors=decided.flatMap(change=>resolveResumeEdits(source,[{...change,status:'accepted'}]).edits);
  const replaced=new Set<string>();
  const fresh=proposed.flatMap(change=>{
    const range=resolveResumeEdits(source,[change]).edits[0];
    if(!range)return [];
    const overlaps=anchors.filter(anchor=>range.start<anchor.end&&anchor.start<range.end);
    if(!overlaps.length)return [change];
    // Only an explicitly answered paragraph may reopen an old decision. Never
    // guess a mapping across multiple decisions or erase unrelated rejection.
    const anchor=overlaps[0];
    if(overlaps.length!==1||anchor.start!==range.start||anchor.end!==range.end
      ||!reopenedSources.some(text=>change.before.includes(text)||text.includes(change.before)))return [];
    const old=anchor.change;
    const baseline=old.status==='accepted'?old.after:old.before;
    if(change.after.trim()===baseline.trim())return [];
    replaced.add(old.id);
    return [{...change,previousDecision:{after:old.after,status:old.status as 'accepted'|'rejected',reason:old.reason,evidenceId:old.evidenceId,evidenceIds:old.evidenceIds,editedByUser:old.editedByUser}}];
  });
  return [...decided.filter(change=>!replaced.has(change.id)),...fresh];
}

export function decideResumeChange(change:ResumeChange,status:'accepted'|'rejected'):ResumeChange{
  const {previousDecision,...current}=change;
  return status==='rejected'&&previousDecision?{...current,...previousDecision}:{...current,status};
}
