import { createHash } from "node:crypto";

export const evalUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export type EvalFeedbackInput = {
  id: string; runId: string; changeId: string | null;
  scope: "change" | "whole_document";
  category: "format" | "quality" | "grounding" | "questioning" | "system" | "other";
  verdict: "improve" | "fail" | "pass"; note: string; expected: string;
};
export function parseEvalFeedback(value: unknown): EvalFeedbackInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (Object.keys(d).some(k => !["id","runId","changeId","scope","category","verdict","note","expected"].includes(k)) ||
    !evalUuid(d.id) || !evalUuid(d.runId) ||
    !["change","whole_document"].includes(String(d.scope)) ||
    !["format","quality","grounding","questioning","system","other"].includes(String(d.category)) ||
    !["improve","fail","pass"].includes(String(d.verdict)) ||
    typeof d.note !== "string" || !d.note.trim() || d.note.length > 6000 ||
    typeof d.expected !== "string" || d.expected.length > 6000 ||
    (d.scope === "change" ? typeof d.changeId !== "string" || !d.changeId.trim() || d.changeId.length > 180 : d.changeId !== null)) return null;
  return { ...d, id: d.id.toLowerCase(), runId: d.runId.toLowerCase(), note: d.note.trim(), expected: d.expected.trim() } as EvalFeedbackInput;
}
/** Only actual delivered changes are valid targets; never accept invented IDs or span IDs. */
export function evalRunChangeIds(run: Record<string, unknown>): Set<string> {
  const result = run.result as { output?: { changes?: unknown[] }; rawResponse?: { changes?: unknown[] } } | undefined;
  const changes = result?.rawResponse?.changes || result?.output?.changes;
  return new Set((Array.isArray(changes) ? changes : []).flatMap(change => {
    if (!change || typeof change !== "object") return [];
    const id = (change as { id?: unknown }).id;
    return typeof id === "string" && id ? [id] : [];
  }));
}
export function feedbackHash(body: EvalFeedbackInput, actorId: string): string {
  return createHash("sha256").update(JSON.stringify([
    actorId, body.runId, body.changeId, body.scope, body.category, body.verdict, body.note, body.expected,
  ])).digest("hex");
}
export function feedbackView(row: Record<string, unknown>) {
  return { id: row.id, runId: row.run_id, resumeTraceId: row.resume_trace_id,
    changeId: row.change_id, scope: row.scope, category: row.category, verdict: row.verdict,
    note: row.note, expected: row.expected, status: row.status, createdAt: row.created_at };
}
