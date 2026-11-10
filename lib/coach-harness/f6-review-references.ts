import type {F6ReviewHints} from './f6-review-hints';

/** Avoid sending both complete documents again in every diff. Both consumers
 * already have those documents. Full pairs remain in the review receipt.
 * Keep this adapter pure to avoid importing the execution/runtime graph. */
export function f6ReviewReferences(source: string, candidate: string, hints: F6ReviewHints) {
  const range = (text: string, excerpt: string) => {
    if (!excerpt) return {start: null, end: null, empty: true};
    const start = text.indexOf(excerpt);
    if (start < 0) throw Error('F6_REVIEW_REFERENCE_NOT_IN_DOCUMENT');
    return {start, end: start + excerpt.length, empty: false};
  };
  return {
    policy: hints.policy,
    referenceMeaning: '位置是对应完整文档的JavaScript字符串下标；原文/新稿已分别提供。差异和数字提示均非判错结论。',
    sourceOnlyStandaloneLines: hints.sourceOnlyStandaloneLines,
    passages: hints.passages.map(part => ({
      source: {document: 'resume.md', ...range(source, part.before)},
      candidate: {document: 'candidate.md', ...range(candidate, part.after)},
      notices: part.notices,
    })),
  };
}
