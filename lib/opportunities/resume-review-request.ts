import type {Opportunity} from './types';

/** General résumé preparation may be checked before a target JD exists. */
export function canRequestResumeReview(item: Opportunity | null | undefined): item is Opportunity & {resumeText:string} {
  return Boolean(item?.resumeText && item.resumeChanges.length && (item.jdText || item.workspaceType==='preparation'));
}
export function resumeReviewRequest(item: Opportunity & {resumeText:string}, requestId: string) {
  return {
    opportunityId:item.id,resumeText:item.resumeText,jobDescription:item.jdText,changes:item.resumeChanges,requestId,
    ...(item.workspaceType==='preparation'?{mode:'general_resume'}:{}),
  };
}
