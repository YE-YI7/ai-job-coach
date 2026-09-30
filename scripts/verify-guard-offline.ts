/** 离线复跑：把首轮回放存的原始回复重新过一遍新守卫，看误挡是否翻成放行、该拦的是否仍拦。 */
import { readFileSync } from "node:fs";
import { guardInsufficientReply, type ProvidedMaterial } from "../lib/coach-harness/insufficiency-guard.ts";

const rows = JSON.parse(readFileSync("docs/architecture/evals/replay-2026-09-29.json", "utf8")).rows as Array<{
  id: string; direction: string; materials: string; message: string; rawReply: string;
  guard: { level: string | null; blocked: boolean; collapsed: boolean };
}>;

function parseTutorReply(raw: string) {
  const m = raw.match(/<followups>([\s\S]*?)<\/followups>/i);
  let suggestions: string[] = [];
  try { const p = JSON.parse((m?.[1] ?? "[]").trim()); if (Array.isArray(p)) suggestions = p.filter((s) => typeof s === "string"); } catch { suggestions = []; }
  return { answer: raw.replace(/<followups>[\s\S]*?<\/followups>/gi, "").replace(/^\s*<answer>\s*/i, "").replace(/<\/answer>/gi, "").trim(), suggestions };
}

/** 【JD 原文…】/【简历原文…】段落 = 上下文里真的带着原文；「（系统内没有该 JD 的任何文本）」不算。 */
function provided(materials: string): ProvidedMaterial[] {
  const section = (label: string) => {
    const start = materials.indexOf(`【${label}`);
    if (start < 0) return "";
    const next = materials.indexOf("【", start + 1);
    return materials.slice(start, next < 0 ? undefined : next).trim();
  };
  const jd = section("JD 原文");
  const resume = section("简历原文");
  return [jd ? { kind: "jd", text: jd } : null, resume ? { kind: "resume", text: resume } : null]
    .filter((x): x is ProvidedMaterial => Boolean(x));
}

for (const row of rows) {
  if (!row.rawReply) continue;
  const parsed = parseTutorReply(row.rawReply);
  const next = guardInsufficientReply({ answer: parsed.answer, suggestions: parsed.suggestions, userText: row.message, providedMaterials: provided(row.materials) });
  const changed = row.guard.blocked !== next.blocked;
  if (changed || next.downgradedRedundantAsk) {
    console.log(`${row.id} ${row.direction} | blocked ${row.guard.blocked} → ${next.blocked} | ${next.downgradedRedundantAsk ?? "-"} | 材料=[${provided(row.materials).map((m) => m.kind)}] | 可见 ${next.answer.length} 字`);
  }
}
