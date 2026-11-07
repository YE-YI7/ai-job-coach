import type {DocumentReview, DocumentFinding} from './resume-document-review';
export const F6_NATIVE_WORKFLOW = 'f6-native-document-v1-review-on-demand';

export const F6_DEFERRED_REVIEW_SUMMARY = '本轮按 F6 交付整稿建议，未自动运行独立审稿；可确认修改后主动点“检查修改”。';

/** Mechanical validation is never an independent semantic verdict. */
export function deferredF6DocumentReview(findings: DocumentFinding[]): DocumentReview {
  return {
    status: findings.some(item=>item.severity==='error') ? 'failed' : 'passed',
    source:'deterministic_format',
    summary:'程序结构检查已完成；未运行独立语义审稿，不代表改稿质量或事实已独立核实。',
    findings,
  };
}
