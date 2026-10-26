import { resumeSourceParagraphs } from './coach-harness/resume-source-structure';

/** Render physical OCR wraps as one paragraph, without changing saved text.
 * Bound the keep-together area so long prose can still paginate normally. */
export function resumePrintParagraphRuns(lines: string[]) {
  const source = lines.join('\n');
  const runs = new Map<number, number>();
  let cursor = 0;
  for (const paragraph of resumeSourceParagraphs(source)) {
    const start = source.indexOf(paragraph, cursor);
    if (start < 0) continue;
    cursor = start + paragraph.length;
    const count = paragraph.split('\n').length;
    if (count < 2 || count > 12 || paragraph.length > 1200) continue;
    const first = source.slice(0, start).split('\n').length - 1;
    runs.set(first, first + count - 1);
  }
  return runs;
}
