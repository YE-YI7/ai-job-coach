import { comparisonDiff } from './resume-comparison';

/** The author delivers a document, not suggestions. Only after writing, the
 * host derives exact, independently reversible source ranges. No text is
 * rewritten, truncated or supplied by this adapter. */
export function projectF6Document(source: string, candidate: string) {
  type Edit = { start: number; end: number; text: string };
  const edits: Edit[] = [];
  let offset = 0;
  for (const part of comparisonDiff(source, candidate)) {
    if (part.kind === 'same') { offset += part.text.length; continue; }
    const last = edits.at(-1);
    const edit = last && last.end === offset ? last : { start: offset, end: offset, text: '' };
    if (edit !== last) edits.push(edit);
    if (part.kind === 'delete') { offset += part.text.length; edit.end = offset; }
    else edit.text += part.text;
  }
  const lineStart = (at: number) => at <= 0 ? 0 : source.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = (at: number) => {
    const next = source.indexOf('\n', at);
    return next < 0 ? source.length : next + 1;
  };
  const groups: Array<{ start: number; end: number; edits: Edit[] }> = [];
  for (const edit of edits) {
    let start = lineStart(edit.start), end = lineEnd(Math.max(edit.start, edit.end - 1));
    // Inserting at EOF needs an actual source anchor, not an empty before.
    if (start === end) start = lineStart(Math.max(0, start - 1));
    while (source.slice(start, end) && source.indexOf(source.slice(start, end)) !== source.lastIndexOf(source.slice(start, end))) {
      if (start > 0) start = lineStart(start - 1);
      else if (end < source.length) end = lineEnd(end);
      else break;
    }
    const previous = groups.at(-1);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      previous.edits.push(edit);
    } else groups.push({ start, end, edits: [edit] });
  }
  // Expanding an ambiguous anchor can cover more than one preceding hunk.
  for (let i = groups.length - 1; i > 0; i--) {
    if (groups[i].start <= groups[i - 1].end) {
      const current = groups.splice(i, 1)[0], previous = groups[i - 1];
      previous.start = Math.min(previous.start, current.start);
      previous.end = Math.max(previous.end, current.end);
      previous.edits.push(...current.edits);
    }
  }
  const result = groups.map(group => {
    const before = source.slice(group.start, group.end);
    let after = before;
    for (const edit of [...group.edits].sort((a, b) => b.start - a.start)) {
      after = after.slice(0, edit.start - group.start) + edit.text + after.slice(edit.end - group.start);
    }
    return { before, after };
  });
  let rebuilt = source;
  for (let i = result.length - 1; i >= 0; i--) {
    const group = groups[i];
    rebuilt = rebuilt.slice(0, group.start) + result[i].after + rebuilt.slice(group.end);
  }
  if (rebuilt !== candidate || result.some(change => !change.before)) throw Error('F6_DOCUMENT_PROJECTION_FAILED');
  return result;
}
