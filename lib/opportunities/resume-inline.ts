import type { ResumeChange } from "./types";
import { resolveResumeEdits } from "../coach-harness/application-quality";

export interface ResumeInk { start: number; end: number; id: string; kind: "added" | "removed" | "reworded" }
type Piece = { text: string; kind: "same" | "added" | "removed" | "reworded" };

/** 字符级 LCS；对长段落设上限，避免浏览器为差异矩阵分配无界内存。 */
export function resumeInkDiff(before: string, after: string): Piece[] {
  if (before === after) return [{ text: after, kind: "same" }];
  const a = Array.from(before), b = Array.from(after);
  if (a.length * b.length > 500_000) {
    // Trim identical edges before applying the memory cap. A long document
    // with one small edit must not become two fully red/yellow documents.
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - end - 1] === b[b.length - end - 1]) end++;
    if (start || end) return [
      ...(start ? [{ text: a.slice(0, start).join(''), kind: 'same' as const }] : []),
      ...resumeInkDiff(a.slice(start, a.length - end).join(''), b.slice(start, b.length - end).join('')),
      ...(end ? [{ text: a.slice(a.length - end).join(''), kind: 'same' as const }] : []),
    ];
    // Unchanged lines are safe anchors even when edits occur far apart. Pick
    // a central unique anchor; never align duplicate résumé sentences by guess.
    const lines = before.match(/[^\n]+\n/g) || [];
    const anchor = [...lines].sort((x, y) =>
      Math.abs(before.indexOf(x) - before.length / 2) - Math.abs(before.indexOf(y) - before.length / 2)
    ).find(line => line.length > 8 && before.indexOf(line) === before.lastIndexOf(line)
      && after.includes(line) && after.indexOf(line) === after.lastIndexOf(line));
    if (anchor) {
      const left = before.indexOf(anchor), right = after.indexOf(anchor);
      return [...resumeInkDiff(before.slice(0, left), after.slice(0, right)),
        { text: anchor, kind: 'same' }, ...resumeInkDiff(before.slice(left + anchor.length), after.slice(right + anchor.length))];
    }
    return [{ text: before, kind: 'removed' }, { text: after, kind: 'reworded' }].filter(p => p.text) as Piece[];
  }
  const stride = b.length + 1, dp = new Uint16Array((a.length + 1) * stride);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i * stride + j] = a[i] === b[j] ? dp[(i + 1) * stride + j + 1] + 1 : Math.max(dp[(i + 1) * stride + j], dp[i * stride + j + 1]);
  const pieces: Piece[] = [];
  const push = (text: string, kind: Piece["kind"]) => { const last = pieces.at(-1); if (last?.kind === kind) last.text += text; else pieces.push({ text, kind }); };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push(a[i++], "same"); j++; }
    else if (i < a.length && (j === b.length || dp[(i + 1) * stride + j] >= dp[i * stride + j + 1])) push(a[i++], "removed");
    else push(b[j++], "added");
  }
  // 同一位置的删改用黄色；纯新增仍为绿色。删除永远保留红色删除线。
  return pieces.map((piece, index) => piece.kind === "added" && (pieces[index - 1]?.kind === "removed" || pieces[index + 1]?.kind === "removed") ? { ...piece, kind: "reworded" } : piece);
}

/** 默认是建议后的单纸面；关标记不写决定，采纳/拒绝后只留下对应正文。 */
export function resumeInlineProjection(source: string, changes: ResumeChange[], showMarks: boolean) {
  const { edits, findings } = resolveResumeEdits(source, changes);
  let cursor = 0, text = "";
  const ink: ResumeInk[] = [];
  for (const edit of edits) {
    text += source.slice(cursor, edit.start);
    const before=edit.change.previousDecision?.status==='accepted'?edit.change.previousDecision.after:source.slice(edit.start, edit.end);
    const pieces = showMarks && edit.change.status === "pending" ? resumeInkDiff(before, edit.after) : [{ text: edit.after, kind: "same" as const }];
    const notices=showMarks&&edit.change.status==='pending'?(edit.change.evidenceNotices||[]).filter(notice=>
      notice.start>=0&&notice.end>notice.start&&edit.after.slice(notice.start,notice.end)===notice.quote):[];
    let afterOffset=0;
    for (const piece of pieces) {
      const cuts=[...new Set([0,piece.text.length,...(piece.kind==='removed'?[]:notices.flatMap(notice=>
        [notice.start-afterOffset,notice.end-afterOffset].filter(at=>at>0&&at<piece.text.length)))])].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const segment=piece.text.slice(cuts[i-1],cuts[i]),start=text.length;
        const needsConfirmation=piece.kind!=='removed'&&notices.some(notice=>
          afterOffset+cuts[i-1]>=notice.start&&afterOffset+cuts[i]<=notice.end);
        const kind=needsConfirmation?'reworded':piece.kind;
        text+=segment;
        if(kind!=='same'&&segment.trim()){
          const last=ink.at(-1);
          if(last&&last.end===start&&last.kind===kind&&last.id===edit.change.id)last.end=text.length;
          else ink.push({start,end:text.length,kind,id:edit.change.id});
        }
      }
      if(piece.kind!=='removed')afterOffset+=piece.text.length;
    }
    cursor = edit.end;
  }
  text += source.slice(cursor);
  return { text, ink, findings };
}
