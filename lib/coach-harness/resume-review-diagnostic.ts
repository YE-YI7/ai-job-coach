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
export type ResumeReviewDiagnostic=ReturnType<typeof resumeReviewDiagnostic> & {attempt:number};
