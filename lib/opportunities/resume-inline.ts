import type { ResumeChange } from "./types";
import { resolveResumeEdits } from "../coach-harness/application-quality";

export interface ResumeInk { start: number; end: number; id: string; kind: "added" | "removed" | "reworded" }
type Piece = { text: string; kind: "same" | "added" | "removed" | "reworded" };

/** 字符级 LCS；对长段落设上限，避免浏览器为差异矩阵分配无界内存。 */
export function resumeInkDiff(before: string, after: string): Piece[] {
  if (before === after) return [{ text: after, kind: "same" }];
  const a = Array.from(before), b = Array.from(after);
  if (a.length * b.length > 500_000) return [{ text: before, kind: "removed" }, { text: after, kind: "reworded" }].filter(p => p.text) as Piece[];
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
    const pieces = showMarks && edit.change.status === "pending" ? resumeInkDiff(source.slice(edit.start, edit.end), edit.after) : [{ text: edit.after, kind: "same" as const }];
    for (const piece of pieces) {
      const start = text.length;
      text += piece.text;
      if (piece.kind !== "same" && piece.text.trim()) ink.push({ start, end: text.length, kind: piece.kind, id: edit.change.id });
    }
    cursor = edit.end;
  }
  text += source.slice(cursor);
  return { text, ink, findings };
}
