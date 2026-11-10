import type {ResumeEvidenceNotice} from '@/lib/opportunities/types';
import type {GroundingSource} from './citation-verifier';
import {f6EvidenceNotices} from './resume-f6-delivery';
import {projectF6Document} from './resume-f6-projection';

export type F6ReviewHints = {
  policy: 'mechanical_hints_not_verdict';
  passages: Array<{before: string; after: string; notices: ResumeEvidenceNotice[]}>;
  sourceOnlyStandaloneLines: Array<{line: number; text: string}>;
};

/** Reuse the existing nonblocking ink checks BEFORE HR, not just after the
 * whole run. Exact source/candidate pairs are data for the reviewer, never
 * new candidate facts or a programmatic semantic verdict. */
export function f6ReviewHints(source: string, candidate: string, sources: GroundingSource[]): F6ReviewHints {
  return {
    policy: 'mechanical_hints_not_verdict',
    // Small standalone fields can disappear inside a much larger replacement
    // block. Surface their exact source location, without deciding whether a
    // paraphrase is equivalent or whether deleting it was appropriate.
    sourceOnlyStandaloneLines: source.split('\n').flatMap((raw, index) => {
      const text = raw.trim();
      return text && text.length <= 120 && !/[。；！？]/u.test(text) && !candidate.includes(text)
        ? [{line: index + 1, text}] : [];
    }),
    passages: projectF6Document(source, candidate).map(({before, after}) => {
      const notices = f6EvidenceNotices(after, sources);
      return {before, after, notices};
    }),
  };
}
