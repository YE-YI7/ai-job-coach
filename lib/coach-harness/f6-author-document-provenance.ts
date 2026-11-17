import {createHash} from 'node:crypto';
import {comparisonDiff} from './resume-comparison';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Author continuation state, not a factual verdict or another model task. Both
 * sides come from immutable input / actual output, never from author notes. */
export function f6AuthorDocumentProvenance(source: string, candidate: string, revision: number, files: string[]) {
  let sourceOffset = 0, candidateOffset = 0;
  const parts = comparisonDiff(source, candidate).map(part => {
    const sourceStart = sourceOffset, candidateStart = candidateOffset;
    if (part.kind !== 'add') sourceOffset += part.text.length;
    if (part.kind !== 'delete') candidateOffset += part.text.length;
    // Unchanged bytes already exist in the initial input. Refer to them rather
    // than injecting the whole original document into every continuation.
    return {kind: part.kind, sourceStart, sourceEnd: sourceOffset, candidateStart, candidateEnd: candidateOffset,
      ...(part.kind === 'same' ? {} : {text: part.text})};
  });
  return {
    sourceReference: {
      document: 'original-resume.md', origin: 'user_supplied_resume',
      sha256: sha256(source), immutableDuringGeneration: true,
      verification: 'user_report_not_independently_verified',
    },
    savedArtifacts: files.map(document => ({
      document, origin: 'current_ai_author', authority: 'ai_output_not_user_statement',
      resumeRevision: revision,
    })),
    sourceComparison: {
      policy: 'literal_text_difference_not_factual_verdict',
      sourceDocument: 'original-resume.md', candidateDocument: 'resume-new.md',
      candidateSha256: sha256(candidate),
      meaning: {
        same: '用户原文与AI稿共有的文字，不等于独立核实',
        delete: '用户原文有、AI稿未保留的文字',
        add: 'AI稿新增的文字；不能仅凭AI写过、notes解释或HR认可称为用户原话，可另查本人补充或聊天依据',
      },
      parts,
    },
  };
}
