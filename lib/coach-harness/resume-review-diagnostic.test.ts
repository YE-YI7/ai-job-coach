import {resumeReviewDiagnostic,resumeReviewProtocolIssue,resumeReviewRepairHint,preserveResumeReviewRejections} from './resume-review-diagnostic';
import type {ResumeChange} from '@/lib/opportunities/types';
const changes=[{id:'c-1'} as ResumeChange];
const valid={status:'passed',summary:'检查已有事实和表述',findings:[],valueChecks:[{index:0,useful:true,kind:'clarity',reason:'将事实动作和交付清晰对应'}],document:{status:'passed',summary:'整稿结构和事实一致',findings:[]}};
test('explicit requests require a coverage verdict, without inventing an incomplete verdict',()=>{
 expect(resumeReviewProtocolIssue(valid,changes,true)).toBe('review_request_coverage_missing');
 expect(resumeReviewProtocolIssue({...valid,requestCoverage:{status:'complete',unaddressed:[],summary:'总领与四项要求均在正文中完成'}},changes,true)).toBeNull();
});
test('contract correction cannot erase real failures on an unchanged candidate',()=>{
 const old={...valid,status:'failed',findings:[{changeId:'c-1',severity:'error',message:'责任被拔高，退回原编辑'}],
   valueChecks:[{index:0,useful:false,kind:'none',reason:'只有换词没有真实内容改善'}],
   document:{status:'failed',summary:'有未解决的整稿错误',findings:[{changeId:'c-1',category:'grounding',severity:'error',message:'新写主导缺来源'}]},
   requestCoverage:{status:'partial',unaddressed:['项目定位'],summary:'项目定位要求尚未完成，请原编辑返修'}};
 const repaired=preserveResumeReviewRejections(old,{...valid,requestCoverage:{status:'complete',unaddressed:[],summary:'模型试图把失败改为完成'}},changes);
 expect(repaired).toMatchObject({status:'failed',findings:old.findings,document:old.document,valueChecks:old.valueChecks,requestCoverage:old.requestCoverage});
 expect(resumeReviewProtocolIssue(repaired,changes,true)).toBeNull();
 const unmapped=preserveResumeReviewRejections({...valid,status:'failed',findings:[{changeId:'0',severity:'error',message:'候选新增未提供的主导职责'}]},valid,changes);
 expect(unmapped.document).toMatchObject({status:'failed',findings:[{changeId:null,severity:'error',message:expect.stringContaining('新增未提供的主导职责')}]});
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
