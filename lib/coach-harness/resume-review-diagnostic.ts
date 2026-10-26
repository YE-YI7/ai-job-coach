import type {ResumeChange} from '@/lib/opportunities/types';
import {readDocumentReview} from './resume-document-review';
import {readResumeValueChecks} from './resume-edit-value';
import {readResumeRequestCoverage} from './resume-edit-request';
import {readResumeNarrativeReview,type ResumeEditorialPlan} from './resume-editorial-plan';

/** Only tighten a contradictory passed -> failed. Raw output stays in Eval;
 * never invent missing fields or turn a negative verdict into a pass. */
export function tightenResumeNarrativeVerdict(raw: unknown, plan: ResumeEditorialPlan | null) {
 if (!plan || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
 const review = raw as Record<string, unknown>;
 const narrative = review.narrativeReview;
 if (!narrative || typeof narrative !== 'object' || Array.isArray(narrative)) return raw;
 const verdict = narrative as Record<string, unknown>;
 if (verdict.status !== 'passed') return raw;
 const tightened = { ...verdict, status: 'failed' };
 if (!readResumeNarrativeReview(tightened, plan)) return raw;
 return { ...review, narrativeReview: tightened };
}

/** Preserve an explicit negative judgment even when all its findings were
 * mislabeled warnings. This only adds a blocking protocol receipt; it never
 * changes a warning into proof of success or modifies the original capture. */
export function preserveFailedResumeDocument(raw: unknown, changes: ResumeChange[]) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
 const review = raw as Record<string, unknown>;
 if (review.status !== 'failed' || !review.document || typeof review.document !== 'object') return raw;
 const document = review.document as Record<string, unknown>;
 if (readDocumentReview(document, changes, 'independent').contractError !== 'document_failed_without_error') return raw;
 const checked = readDocumentReview({ ...document, status: 'passed' }, changes, 'independent');
 if (checked.contractError || !checked.findings.length || checked.findings.length >= 20) return raw;
 return { ...review, document: { ...document, findings: [...checked.findings, {
  changeId: null, category: 'system', severity: 'error',
  message: '独立质检明确判定未通过；严重级别返回不一致，保留失败并退回原编辑，不重说为通过。',
 }] } };
}

/** Contract correction cannot reconsider the same unchanged draft's merits. */
export function resumeReviewRepairReversedFailure(before: unknown, after: unknown) {
 const failed = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  if (value.status === 'failed' && (Array.isArray(value.findings) && value.findings.length
    || Array.isArray(value.valueChecks) && value.valueChecks.some(check => check?.useful === false))) return true;
  const document = value.document as Record<string, unknown> | undefined;
  const narrative = value.narrativeReview as Record<string, unknown> | undefined;
  return Boolean(document?.status === 'failed' && Array.isArray(document.findings) && document.findings.length
    || narrative?.status === 'failed' && (narrative.mainlineSupported === false
      || Array.isArray(narrative.goals) && narrative.goals.some(goal => goal?.status === 'not_addressed')));
 };
 return failed(before) && !failed(after);
}

/** An invalid review is not an editing instruction. Keep the grounded draft
 * fixed while obtaining one corrected verdict, never ask the editor to guess. */
export function resumeReviewProtocolIssue(raw:unknown,changes:ResumeChange[],plan:ResumeEditorialPlan|null=null) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'review_not_object';
 const r=raw as Record<string,unknown>;
 if(r.status!=='passed'&&r.status!=='failed')return 'review_status_invalid';
 const allowed=['status','summary','findings','valueChecks','document','recovery','requestCoverage',...(plan?['narrativeReview']:[])];
 if(Object.keys(r).some(k=>!allowed.includes(k)))return 'review_unexpected_fields';
 if(plan&&!readResumeNarrativeReview(r.narrativeReview,plan))return 'review_narrative_invalid';
 if('requestCoverage' in r&&readResumeRequestCoverage(r.requestCoverage).status==='unverified')return 'review_request_coverage_invalid';
 if((r.summary!==undefined&&(typeof r.summary!=='string'||!r.summary.trim()))||!Array.isArray(r.findings)||r.findings.length>20)return 'review_fields_invalid';
 const ids=new Set(changes.map(c=>c.id));
 if(r.findings.some(f=>!f||typeof f!=='object'||Array.isArray(f)||!ids.has(f.changeId)||!['error','warning'].includes(f.severity)||typeof f.message!=='string'||!f.message.trim()))return 'review_finding_unmapped';
 const document=readDocumentReview(r.document,changes,'independent');
 if(document.contractError)return document.contractError;
 if(r.status==='failed'&&!r.findings.length&&document.status!=='failed'
   && !(plan && readResumeNarrativeReview(r.narrativeReview,plan)?.status==='failed'))return 'review_failure_unattributed';
 const checks=readResumeValueChecks(r.valueChecks,changes.length);
 if(checks.length!==changes.length||new Set(checks.map(c=>c.index)).size!==changes.length)return 'review_value_checks_invalid';
 return null;
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
  review_narrative_invalid:'narrativeReview必须逐项核对所有priority id，各一次；mainlineSupported为布尔值，status/summary/goals完整。只改标题和同义词不能填addressed，原文已好则具体说明keep_original。',
  review_request_coverage_invalid:'requestCoverage必须含status、unaddressed与具体summary；complete时未完成列表为空，否则必须列出尚未完成的目标。',
  document_missing:'必须同时返回document对象，不能只给逐条结论。',
  document_unexpected_fields:'document仅含status、summary、findings；不要加入source、score、recovery或正文。',
  document_finding_fields_invalid:'document.findings条目仅含changeId、category、severity、message。需要补问的原句和问题放顶层recovery，不放findings条目内。',
  document_finding_id_invalid:'document.findings.changeId只能逐字复制待审修改的真实id，或使用JSON的null表示整稿/未修改原文；不能写字符串"null"、章节标题或数字序号。',
  document_failed_without_error:'仅修复字段与严重级别，禁止推翻上一轮对同一稿的失败结论。明确未完成的内容目标应保留failed并给对应error；缺信息的warning仍是warning，不改写正文。',
  review_failure_unattributed:'逐条status=failed必须填写真实修改id的问题；若逐条没有问题，status设为passed，整稿问题单独放document。',
  review_value_checks_invalid:'对每条待审修改给恰好一个valueChecks；index使用0起始序号，useful为JSON布尔值，kind从规定枚举中选一个，reason说明实际编辑价值。',
 };
 return hints[issue]||'按唯一输出契约补全正确的字段、类型和枚举，不新增正文或自造修改id。';
}
export type ResumeReviewDiagnostic=ReturnType<typeof resumeReviewDiagnostic> & {attempt:number;protocolIssue?:ReturnType<typeof resumeReviewProtocolIssue>};
