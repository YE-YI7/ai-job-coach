import { readFileSync } from "node:fs";
import { parseTutorReply } from "@/lib/coach-harness/chat-options";
import { guardInsufficientReply, reaskReason, type ProvidedMaterial } from "@/lib/coach-harness/insufficiency-guard";

// 真实模型历史输出，离线重放当前护栏，不重新外发用户材料或花模型额度。
// 这只测协议/已知失败模式，不冒充新模型质量评测，更不是人标校准。
type ArchivedRow = { id: string; rawReply: string; materials: string; message: string; direction: string };
const rows: ArchivedRow[] = JSON.parse(readFileSync("docs/architecture/evals/replay-2026-09-29-post-fr2-fix.json", "utf8")).rows;
function provided(text: string): ProvidedMaterial[] {
  return ([ ["jd", "JD 原文"], ["resume", "简历原文"] ] as const).flatMap(([kind, label]) => {
    const start = text.indexOf(`【${label}`);
    if (start < 0) return [];
    const end = text.indexOf("【", start + 1);
    return [{ kind, text: text.slice(start, end < 0 ? undefined : end) }];
  });
}
test("历史回放来源保持 30 条且不重复", () => {
  expect(rows).toHaveLength(30);
  expect(new Set(rows.map(row => row.id)).size).toBe(30);
});
test.each(rows)("$id：真实历史输出经当前护栏后可读，不重索已有原文", (row) => {
  const parsed = parseTutorReply(row.rawReply.replace(/^\s*<answer>\s*/i, "").replace(/<\/answer>/gi, ""));
  const materials = provided(row.materials);
  const result = guardInsufficientReply({ ...parsed, userText: row.message, providedMaterials: materials });
  expect(result.answer.trim().length).toBeGreaterThan(0);
  expect(result.answer).not.toMatch(/<\/?(?:answer|followups|clarify)\b/i);
  expect(reaskReason(result.answer, materials)).not.toBe("document_handover");
  if (row.id === "GS-004") expect(result.blocked).toBe(false);
  if (["GS-005", "GS-006"].includes(row.id)) expect(result.level).toBe("blocking");
});
