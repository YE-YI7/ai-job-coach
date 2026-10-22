import type {ResumeChange} from '@/lib/opportunities/types';
import {readDocumentReview} from './resume-document-review';
import {readResumeValueChecks} from './resume-edit-value';

/** An invalid review is not an editing instruction. Keep the grounded draft
 * fixed while obtaining one corrected verdict, never ask the editor to guess. */
export function resumeReviewProtocolIssue(raw:unknown,changes:ResumeChange[]) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'review_not_object';
 const r=raw as Record<string,unknown>;
 if(r.status!=='passed'&&r.status!=='failed')return 'review_status_invalid';
 if(Object.keys(r).some(k=>!['status','summary','findings','valueChecks','document','recovery'].includes(k)))return 'review_unexpected_fields';
 if((r.summary!==undefined&&(typeof r.summary!=='string'||!r.summary.trim()))||!Array.isArray(r.findings)||r.findings.length>20)return 'review_fields_invalid';
 const ids=new Set(changes.map(c=>c.id));
 if(r.findings.some(f=>!f||typeof f!=='object'||Array.isArray(f)||!ids.has(f.changeId)||!['error','warning'].includes(f.severity)||typeof f.message!=='string'||!f.message.trim()))return 'review_finding_unmapped';
 const document=readDocumentReview(r.document,changes,'independent');
 if(document.contractError)return 'review_document_invalid';
 if(r.status==='failed'&&!r.findings.length&&document.status!=='failed')return 'review_failure_unattributed';
 const checks=readResumeValueChecks(r.valueChecks,changes.length);
 if(checks.length!==changes.length||new Set(checks.map(c=>c.index)).size!==changes.length)return 'review_value_checks_invalid';
 return null;
}

/** Operational categories only. Never store model text, material or arbitrary IDs. */
export function resumeReviewDiagnostic(raw:unknown, changeIds:string[], useful:number) {
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
      :useful===0?'review_no_useful_change':'review_verdict_received'};
}
export type ResumeReviewDiagnostic=ReturnType<typeof resumeReviewDiagnostic> & {attempt:number;protocolIssue?:ReturnType<typeof resumeReviewProtocolIssue>};
