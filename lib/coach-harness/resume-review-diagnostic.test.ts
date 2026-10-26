import {resumeReviewDiagnostic,resumeReviewProtocolIssue,resumeReviewRepairHint,tightenResumeNarrativeVerdict,
 preserveFailedResumeDocument,resumeReviewRepairReversedFailure} from './resume-review-diagnostic';
import type { ResumeEditorialPlan } from './resume-editorial-plan';
import type {ResumeChange} from '@/lib/opportunities/types';
const changes=[{id:'c-1'} as ResumeChange];
const valid={status:'passed',summary:'检查已有事实和表述',findings:[],valueChecks:[{index:0,useful:true,kind:'clarity',reason:'将事实动作和交付清晰对应'}],document:{status:'passed',summary:'整稿结构和事实一致',findings:[]}};
const plan:ResumeEditorialPlan={mainline:'已有事实支撑产品判断',claims:[{point:'实际编写检查步骤用于判断',sourceIds:['s1']}],priorities:[{id:'p1',before:'原文已有的具体工作段落',goal:'突出已有检查步骤与判断依据'}]};
test('an explicit failed manuscript with warning-only findings stays failed without a paid restatement', () => {
 const raw = { ...valid, status: 'failed', findings: [{ changeId: 'c-1', severity: 'warning', message: '只修错字，没有兑现内容目标' }],
  valueChecks: [{ index: 0, useful: false, kind: 'clarity', impact: 'correction', reason: '只有错字修复，不算内容改善' }],
  document: { status: 'failed', summary: '明确没有完成内容目标，不能交付为完成',
   findings: [{ changeId: 'c-1', category: 'quality', severity: 'warning', message: '本轮仅有错字修复，仍须内容返修' }] } };
 expect(resumeReviewProtocolIssue(raw, changes)).toBe('document_failed_without_error');
 const normalized = preserveFailedResumeDocument(raw, changes) as typeof raw;
 expect(resumeReviewProtocolIssue(normalized, changes)).toBeNull();
 expect(normalized.status).toBe('failed');
 expect(normalized.document.status).toBe('failed');
 expect(normalized.valueChecks).toBe(raw.valueChecks);
 expect(raw.document.findings).toHaveLength(1);
 expect(preserveFailedResumeDocument({ ...raw, document: { ...raw.document, after: '越权正文' } }, changes))
  .toEqual({ ...raw, document: { ...raw.document, after: '越权正文' } });
 expect(resumeReviewRepairReversedFailure(raw, valid)).toBe(true);
 expect(resumeReviewRepairReversedFailure(raw, normalized)).toBe(false);
 expect(resumeReviewRepairReversedFailure(valid, valid)).toBe(false);
});
test('negative goals only tighten the verdict and return to the editor without another paid judge',()=>{
 const raw={...valid,narrativeReview:{status:'passed',mainlineSupported:true,summary:'主线有依据，但开头仍未按计划改写',goals:[{id:'p1',status:'not_addressed',reason:'本轮未涉及开头，目标尚未处理'}]}};
 expect(resumeReviewProtocolIssue(raw,changes,plan)).toBe('review_narrative_invalid');
 const tightened=tightenResumeNarrativeVerdict(raw,plan) as typeof raw;
 expect(tightened.narrativeReview.status).toBe('failed');
 expect(tightened.narrativeReview.goals).toBe(raw.narrativeReview.goals);
 expect(raw.narrativeReview.status).toBe('passed');
 expect(resumeReviewProtocolIssue(tightened,changes,plan)).toBeNull();
 expect(resumeReviewProtocolIssue({...tightened,status:'failed'},changes,plan)).toBeNull();
 for(const narrativeReview of [{...raw.narrativeReview,goals:[]},{...raw.narrativeReview,goals:[{...raw.narrativeReview.goals[0],id:'unknown'}]},undefined]){
  const malformed={...valid,narrativeReview};expect(tightenResumeNarrativeVerdict(malformed,plan)).toBe(malformed);
 }
 const failed={...tightened};expect(tightenResumeNarrativeVerdict(failed,plan)).toBe(failed);
});
test('separates protocol errors from actionable manuscript findings',()=>{
 expect(resumeReviewProtocolIssue(valid,changes)).toBeNull();
 expect(resumeReviewProtocolIssue({...valid,requestCoverage:{status:'complete',unaddressed:[],summary:'本轮修改要求已经体现在候选中'}},changes)).toBeNull();
 expect(resumeReviewProtocolIssue({...valid,requestCoverage:{status:'complete',unaddressed:['开头'],summary:'开头尚未完成却声明完成'}},changes)).toBe('review_request_coverage_invalid');
 expect(resumeReviewProtocolIssue({...valid,status:'failed'},changes)).toBe('review_failure_unattributed');
 expect(resumeReviewProtocolIssue({...valid,status:undefined},changes)).toBe('review_status_invalid');
 expect(resumeReviewProtocolIssue({...valid,document:undefined},changes)).toBe('document_missing');
 expect(resumeReviewProtocolIssue({...valid,status:'failed',findings:[{changeId:'c-1',severity:'error',message:'丢掉参与限定，须退回原编辑'}]},changes)).toBeNull();
 expect(resumeReviewProtocolIssue({...valid,document:{status:'failed',summary:'本轮破坏列表',findings:[{changeId:'c-1',category:'format',severity:'error',message:'列表符号丢失'}]}},changes)).toBeNull();
});
test('unknown references, duplicate value verdicts and unauthorized rewrites are not manuscript findings',()=>{
 expect(resumeReviewProtocolIssue({...valid,findings:[{changeId:'0',severity:'error',message:'wrong mapping'}]},changes)).toBe('review_finding_unmapped');
 expect(resumeReviewProtocolIssue({...valid,valueChecks:[...valid.valueChecks,...valid.valueChecks]},changes)).toBe('review_value_checks_invalid');
 expect(resumeReviewProtocolIssue({...valid,after:'unauthorized rewrite'},changes)).toBe('review_unexpected_fields');
});
test('explicit negative none/format diagnoses remain rejections without a second review call',()=>{
 for(const kind of ['none','format']){
  const negative={...valid,valueChecks:[{index:0,useful:false,kind,reason:'仅有同义替换或不符合原稿格式，没有可交付价值'}]};
  expect(resumeReviewProtocolIssue(negative,changes)).toBeNull();
  expect(resumeReviewProtocolIssue({...negative,valueChecks:[{...negative.valueChecks[0],useful:true}]},changes)).toBe('review_value_checks_invalid');
 }
});
test('unknown value state is null, not a made-up zero; repair hint targets the exact field',()=>{
 expect(resumeReviewDiagnostic(valid,['c-1'],null)).toMatchObject({useful:null,code:'review_contract_invalid'});
 expect(resumeReviewRepairHint('document_finding_id_invalid')).toContain('JSON的null');
 expect(resumeReviewRepairHint('document_finding_fields_invalid')).toContain('顶层recovery');
});
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
