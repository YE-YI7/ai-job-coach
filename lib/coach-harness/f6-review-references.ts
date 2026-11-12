import type {F6ReviewHints} from './f6-review-hints';
import {splitResumeBlocks,stripResumeMarkdown} from '@/lib/opportunities/resume-blocks';

/** Transport literal evidence, not the UI checker's lexical suspicions.
 * Full pairs and all UI notices remain in the review receipt.
 * Keep this adapter pure to avoid importing the execution/runtime graph. */
export function f6ReviewReferences(source: string, candidate: string, hints: F6ReviewHints) {
  const sourceBlocks=splitResumeBlocks(source),candidateBlocks=splitResumeBlocks(candidate);
  const candidateKinds=new Set(candidateBlocks.map(block=>block.kind));
  const normalized=(text:string)=>text.split('\n').map(stripResumeMarkdown).join('').replace(/\s/g,'');
  const candidateText=normalized(candidate);
  const range = (text: string, excerpt: string) => {
    if (!excerpt) return {start: null, end: null, empty: true};
    const start = text.indexOf(excerpt);
    if (start < 0) throw Error('F6_REVIEW_REFERENCE_NOT_IN_DOCUMENT');
    return {start, end: start + excerpt.length, empty: false};
  };
  return {
    policy: hints.policy,
    referenceMeaning: '位置是对应完整文档的JavaScript字符串下标；原文/新稿已分别提供。这里只传原文位置，不传词面判错提示。',
    sourceOnlyStandaloneLines: hints.sourceOnlyStandaloneLines,
    sourceStructureToReconcile: {
      meaning:'复用原界面分块结果；未识别同类标题不等于事实丢失，改写不同也不是判错。仍须对照完整正文。',
      sourceKinds:[...new Set(sourceBlocks.map(block=>block.kind))],candidateKinds:[...candidateKinds],
      sourceSectionsWithoutRecognizedCounterpart:sourceBlocks.filter(block=>block.heading
        &&!candidateKinds.has(block.kind)&&!block.lines.every(line=>candidateText.includes(normalized(line))))
        .map(block=>({kind:block.kind,heading:block.heading,sourceLines:block.lines})),
    },
    passages: hints.passages.map(part => ({
      source: {document: 'resume.md', ...range(source, part.before)},
      candidate: {document: 'candidate.md', ...range(candidate, part.after)},
    })),
  };
}
