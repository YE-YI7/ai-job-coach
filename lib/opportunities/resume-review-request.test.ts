import {canRequestResumeReview,resumeReviewRequest} from './resume-review-request';
import type {Opportunity} from './types';
const item={id:'own',workspaceType:'preparation',resumeText:'已有完整简历',jdText:'',resumeChanges:[{id:'change'}]} as Opportunity;
test('general résumé manual check remains available without a JD',()=>{
  expect(canRequestResumeReview(item)).toBe(true);
  expect(resumeReviewRequest(item as Opportunity & {resumeText:string},'request')).toMatchObject({mode:'general_resume',jobDescription:''});
  expect(canRequestResumeReview({...item,workspaceType:'job'})).toBe(false);
  expect(canRequestResumeReview({...item,resumeChanges:[]})).toBe(false);
});
