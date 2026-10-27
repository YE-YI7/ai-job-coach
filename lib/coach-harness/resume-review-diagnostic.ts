import type {ResumeChange} from '@/lib/opportunities/types';
import {readDocumentReview} from './resume-document-review';
import {readResumeValueChecks} from './resume-edit-value';
import {readResumeRequestCoverage} from './resume-edit-request';

/** An invalid review is not an editing instruction. Keep the grounded draft
 * fixed while obtaining one corrected verdict, never ask the editor to guess. */
export function resumeReviewProtocolIssue(raw:unknown,changes:ResumeChange[],requireCoverage=false) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'review_not_object';
 const r=raw as Record<string,unknown>;
 if(r.status!=='passed'&&r.status!=='failed')return 'review_status_invalid';
 if(Object.keys(r).some(k=>!['status','summary','findings','valueChecks','document','recovery','requestCoverage'].includes(k)))return 'review_unexpected_fields';
 if(requireCoverage&&!('requestCoverage' in r))return 'review_request_coverage_missing';
 if('requestCoverage' in r&&readResumeRequestCoverage(r.requestCoverage).status==='unverified')return 'review_request_coverage_invalid';
 if((r.summary!==undefined&&(typeof r.summary!=='string'||!r.summary.trim()))||!Array.isArray(r.findings)||r.findings.length>20)return 'review_fields_invalid';
 const ids=new Set(changes.map(c=>c.id));
 if(r.findings.some(f=>!f||typeof f!=='object'||Array.isArray(f)||!ids.has(f.changeId)||!['error','warning'].includes(f.severity)||typeof f.message!=='string'||!f.message.trim()))return 'review_finding_unmapped';
 const document=readDocumentReview(r.document,changes,'independent');
 if(document.contractError)return document.contractError;
 if(r.status==='failed'&&!r.findings.length&&document.status!=='failed')return 'review_failure_unattributed';
 const checks=readResumeValueChecks(r.valueChecks,changes.length);
 if(checks.length!==changes.length||new Set(checks.map(c=>c.index)).size!==changes.length)return 'review_value_checks_invalid';
 return null;
}

/** Correcting a JSON contract is not a new edit. Explicit valid negative
 * diagnoses remain binding while the candidate text is byte-identical. */
export function preserveResumeReviewRejections(previous: unknown, repaired: Record<string,unknown>, changes:ResumeChange[]) {
 const old=previous&&typeof previous==='object'?previous as Record<string,unknown>:{};
 const ids=new Set(changes.map(c=>c.id));
 const errors=Array.isArray(old.findings)?old.findings.filter(f=>f&&ids.has(f.changeId)&&f.severity==='error'&&typeof f.message==='string'):[];
 const result={...repaired};
 if(errors.length){result.status='failed';result.findings=[...errors,...(Array.isArray(repaired.findings)?repaired.findings:[])].slice(0,20);}
 const doc=readDocumentReview(old.document,changes,'independent');
 if(!doc.contractError&&doc.status==='failed')result.document=old.document;
 const unmapped=Array.isArray(old.findings)?old.findings.filter(f=>f&&f.severity==='error'&&typeof f.message==='string'&&f.message.trim()&&!ids.has(f.changeId)):[];
 if(unmapped.length){
   const current=readDocumentReview(result.document,changes,'independent');
   result.document={status:'failed',summary:'此前明确否决的定位尚未可靠核对，补协议不能将其清除。',findings:[
     ...(current.contractError?[]:current.findings),
     ...unmapped.map(f=>({changeId:null,category:'system',severity:'error',message:'原质检否决尚未可靠定位：'+String(f.message).slice(0,1100)})),
   ].slice(0,20)};
 }
 const negative=readResumeValueChecks(old.valueChecks,changes.length).filter(v=>!v.useful);
 if(negative.length&&Array.isArray(repaired.valueChecks))result.valueChecks=repaired.valueChecks.map(v=>negative.find(n=>n.index===v.index)||v);
 const coverage=readResumeRequestCoverage(old.requestCoverage);
 if(coverage.status==='partial'||coverage.status==='not_addressed')result.requestCoverage=old.requestCoverage;
 return result;
}

/** Operational categories only. Never store model text, material or arbitrary IDs. */
export function resumeReviewDiagnostic(raw:unknown, changeIds:string[], useful:number|null) {
  const review=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const status=review.status==='passed'||review.status==='failed'?review.status:review.status===undefined?'missing':'invalid';
  const findings=Array.isArray(review.findings)?review.findings:[];
  const known=new Set(changeIds);
  const mapped=findings.filter(f=>f&&typeof f==='object'&&known.has((f as Record<string,unknown>).changeId as string));
  const unmapped=findings.length-mapped.length;
  return {status,findings:findings.length,mapped:mapped.length,unmapped,
    errors:findings.filter(f=>f&&typeof f==='object'&&(f as Record<string,unknown>).severity==='error').length,
    numericIds:findings.filter(f=>f&&typeof f==='object'&&/^\d+$/.test(String((f as Record<string,unknown>).changeId??''))).length,
    useful,
    code: status==='missing'||status==='invalid'?'review_status_invalid'
      :status==='failed'&&(!findings.length||unmapped)?'review_failure_unattributed'
      :status==='failed'?'review_findings_rejected'
      :useful===null?'review_contract_invalid':useful===0?'review_no_useful_change':'review_verdict_received'};
}
export function resumeReviewRepairHint(issue:string){
 const hints:Record<string,string>={
  review_request_coverage_missing:'本轮有明确修改要求，必须补上requestCoverage:{status:complete|partial|not_addressed,unaddressed:[],summary:具体核对依据}。不要改变已给出的其他有效否决。',
  review_request_coverage_invalid:'requestCoverage必须含status、unaddressed与具体summary；complete时未完成列表为空，否则必须列出尚未完成的目标。',
  document_missing:'必须同时返回document对象，不能只给逐条结论。',
  document_unexpected_fields:'document仅含status、summary、findings；不要加入source、score、recovery或正文。',
  document_finding_fields_invalid:'document.findings条目仅含changeId、category、severity、message。需要补问的原句和问题放顶层recovery，不放findings条目内。',
  document_finding_id_invalid:'document.findings.changeId只能逐字复制待审修改的真实id，或使用JSON的null表示整稿/未修改原文；不能写字符串"null"、章节标题或数字序号。',
  document_failed_without_error:'若只是原稿缺少信息，保留missing_information/warning，并将document.status设为passed；failed必须有本轮引入或明确漏改的error，不能因没有数字/原文待补而否决已有安全修改。',
  review_failure_unattributed:'逐条status=failed必须填写真实修改id的问题；若逐条没有问题，status设为passed，整稿问题单独放document。',
  review_value_checks_invalid:'对每条待审修改给恰好一个valueChecks；index使用0起始序号，useful为JSON布尔值，kind从规定枚举中选一个，reason说明实际编辑价值。',
 };
 return hints[issue]||'按唯一输出契约补全正确的字段、类型和枚举，不新增正文或自造修改id。';
}
export type ResumeReviewDiagnostic=ReturnType<typeof resumeReviewDiagnostic> & {attempt:number;protocolIssue?:ReturnType<typeof resumeReviewProtocolIssue>};
