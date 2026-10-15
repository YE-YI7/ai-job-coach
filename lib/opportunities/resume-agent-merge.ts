import type { ResumeChange } from './types';
import { resolveResumeEdits } from '../coach-harness/application-quality';

/** 再改一轮也不能悄悄推翻用户已经采纳或拒绝的片段。 */
export function mergeResumeAgentChanges(source:string,previous:ResumeChange[],proposed:ResumeChange[]){
  const decided=previous.filter(change=>change.status!=='pending');
  const anchors=decided.flatMap(change=>resolveResumeEdits(source,[{...change,status:'accepted'}]).edits);
  const fresh=proposed.filter(change=>{
    const range=resolveResumeEdits(source,[change]).edits[0];
    return range&&!anchors.some(anchor=>range.start<anchor.end&&anchor.start<range.end);
  });
  return [...decided,...fresh];
}
