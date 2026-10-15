import type { ResumeAgentAnswer } from './resume-task-types';
import type { ResumeChange } from '@/lib/opportunities/types';
import {omitStandaloneDisclaimers} from './resume-edit-value';

/** The action we're completing is the most recent answer, not any historical citation. */
export function currentResumeAnswer(answers:ResumeAgentAnswer[]){
  const answer=answers.at(-1);
  return answer&&!answer.skipped&&answer.answer.trim()&&!/^(我)?(不知道|忘了|不记得|不清楚)[。！!\s]*$/.test(answer.answer.trim())
    &&omitStandaloneDisclaimers(answer.answer.replace(/[。！!]\s*/g,'\n'))?answer:null;
}
export function coversCurrentResumeAnswer(proposals:ResumeChange[],answers:ResumeAgentAnswer[]){
  const answer=currentResumeAnswer(answers);
  return !answer||proposals.some(change=>change.status!=='rejected'&&Boolean(answer.claimId&&change.evidenceIds?.includes(answer.claimId))
    &&Boolean(change.before)&&(change.before.includes(answer.sourceExcerpt)||answer.sourceExcerpt.includes(change.before)));
}
