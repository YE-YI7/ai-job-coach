import {resumeReviewDiagnostic} from './resume-review-diagnostic';
test('records fixed diagnostic categories without copying raw status, messages or IDs',()=>{
 const secret='private material';
 const result=resumeReviewDiagnostic({status:secret,findings:[{changeId:secret,message:secret,severity:'error'}]},['c-1'],1);
 expect(result).toMatchObject({status:'invalid',unmapped:1,errors:1,code:'review_status_invalid'});
 expect(JSON.stringify(result)).not.toContain(secret);
});
test('distinguishes numeric finding IDs, unexplained failure and real attributable rejection',()=>{
 expect(resumeReviewDiagnostic({status:'failed',findings:[]},['c-1'],1).code).toBe('review_failure_unattributed');
 expect(resumeReviewDiagnostic({status:'failed',findings:[{changeId:'0',severity:'error'}]},['c-1'],1)).toMatchObject({numericIds:1,unmapped:1});
 expect(resumeReviewDiagnostic({status:'failed',findings:[{changeId:'c-1',severity:'error'}]},['c-1'],1)).toMatchObject({mapped:1,code:'review_findings_rejected'});
 expect(resumeReviewDiagnostic({status:'passed',findings:[]},['c-1'],1).code).toBe('review_verdict_received');
});
