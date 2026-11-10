import type {F6ReviewHints} from './f6-review-hints';

/** Literal existing projection, not a finding or a model-output parser. */
export function f6AuthorSourceDiff(hints:F6ReviewHints) {
  return hints.passages.map((part,index)=>'@@ 原位差异 '+(index+1)+' @@\n'
    + part.before.split('\n').map(line=>'- '+line).join('\n')+'\n'
    + part.after.split('\n').map(line=>'+ '+line).join('\n')).join('\n\n');
}
