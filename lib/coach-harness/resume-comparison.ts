/** Admin-only comparison copies. Never read or write a live résumé from this contract. */
export const COMPARISON_TYPE = 'resume_comparison';
export const DRAFT_TYPE = 'resume_comparison_draft';
export const DIRECT_TYPE = 'resume_comparison_direct';
/** The legacy viewer treats a top-level traceId as its older steps/retrieval format. Adapt only this new record type. */
export function directRunForEvalViewer(run: Record<string, unknown>): Record<string, unknown> {
  if (run.recordType !== DIRECT_TYPE) return run;
  const {traceId, ...rest} = run;
  const spans = Array.isArray(run.spans) ? run.spans as Array<Record<string, unknown>> : [];
  return {...rest, directTraceId: traceId, provenance: 'production', input: spans[0]?.input ?? null,
    spans: spans.map(s => s.kind === 'agent' ? {...s, agent: s.agent || s.name} : s),
    durationMs: spans.reduce((sum, s) => sum + (typeof s.durationMs === 'number' ? s.durationMs : 0), 0),
    evaluation: null, evaluationStatus: 'not_requested',
    limitations: [String(run.limitation || '模型直改未走产品质检，不代表改稿质量通过。'),
      ...(run.protocolVersion === 'direct-rewrite-v2' ? [] : ['早期直调提示误把正文也要求保持相同，属于配置错误，不作模型能力对照。'])]};
}
export const COLUMN_IDS = ['original', 'manual', 'baseline', 'tuned', 'direct'] as const;
export const EXTENDED_COLUMN_IDS = ['original', 'manual', 'baseline', 'tuned', 'failed', 'direct'] as const;
export type ComparisonSection = {id: string; label: string; text: string};
export type ComparisonColumn = {
  id: typeof EXTENDED_COLUMN_IDS[number]; label: string; status: string; provenance: string;
  sections: ComparisonSection[]; judgments: Array<{label: string; text: string}>;
  traceIds: string[]; changeIds: string[]; runIds: string[];
};
export type ResumeComparison = {
  schemaVersion: 'yizhi.resume-comparison/v1' | 'yizhi.resume-comparison/v2'; id: string; title: string; notes: string[];
  model: string; provider: 'tokendance'; columns: ComparisonColumn[];
  input: {resume: string; jd: string};
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export const uuid = (v: unknown): v is string => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const strings = (v: unknown, max = 80): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => str(x, 2000));
export function parseComparison(v: unknown): ResumeComparison | null {
  if (!object(v) || !['yizhi.resume-comparison/v1', 'yizhi.resume-comparison/v2'].includes(String(v.schemaVersion))) return null;
  const columnIds = v.schemaVersion === 'yizhi.resume-comparison/v2' ? EXTENDED_COLUMN_IDS : COLUMN_IDS;
  if (!uuid(v.id) || !str(v.title, 160) ||
    Object.keys(v).some(k => !['schemaVersion', 'id', 'title', 'notes', 'model', 'provider', 'columns', 'input'].includes(k)) ||
    !strings(v.notes, 12) || v.provider !== 'tokendance' || !str(v.model, 100) || !v.model ||
    !object(v.input) || !str(v.input.resume, 50000) || !v.input.resume || !str(v.input.jd, 30000) ||
    !Array.isArray(v.columns) || v.columns.length !== columnIds.length) return null;
  let sectionIds: string[] = [];
  for (const [i, c] of v.columns.entries()) {
    if (!object(c) || c.id !== columnIds[i] || !str(c.label, 100) || !str(c.status, 300) ||
      !str(c.provenance, 3000) || !Array.isArray(c.sections) || !c.sections.length || c.sections.length > 30 ||
      !Array.isArray(c.judgments) || c.judgments.length > 30 ||
      !c.judgments.every(j => object(j) && str(j.label, 160) && str(j.text, 12000)) ||
      !strings(c.traceIds, 20) || !c.traceIds.every(uuid) || !strings(c.changeIds) ||
      !strings(c.runIds, 20) || !c.runIds.every(uuid)) return null;
    const ids: string[] = [];
    for (const s of c.sections) {
      if (!object(s) || !str(s.id, 80) || !/^[a-z0-9-]+$/.test(s.id) ||
        ids.includes(s.id) || !str(s.label, 160) || !str(s.text, 50000)) return null;
      ids.push(s.id);
    }
    if (i === 0) sectionIds = ids;
    else if (JSON.stringify(ids) !== JSON.stringify(sectionIds)) return null;
  }
  return v as ResumeComparison;
}
export function parseDraft(v: unknown, ids: string[]): Record<string, string> | null {
  if (!object(v) || Object.keys(v).length !== ids.length) return null;
  if (ids.some(id => !str(v[id], 50000)) || Object.keys(v).some(id => !ids.includes(id))) return null;
  if (JSON.stringify(v).length > 100000) return null;
  return v as Record<string, string>;
}
export function plainResume(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^)]+\)/g, '$1');
}
export type DiffPart = {kind: 'same' | 'add' | 'delete'; text: string};
/** Bounded exact token LCS; large edits fall back to one honest replacement, never truncate text. */
export function comparisonDiff(before: string, after: string): DiffPart[] {
  const a = Array.from(before), b = Array.from(after);
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const x = a.slice(start, a.length - end), y = b.slice(start, b.length - end), parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text; else parts.push({kind, text});
  };
  push('same', a.slice(0, start).join(''));
  if (x.length * y.length > 2000000) {
    push('delete', x.join('')); push('add', y.join(''));
  } else {
    const width = y.length + 1, dp = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
      dp[i * width + j] = x[i] === y[j] ? 1 + dp[(i + 1) * width + j + 1] :
        Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    let i = 0, j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {push('same', x[i++]); j++;}
      else if (j < y.length && (i === x.length || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) push('add', y[j++]);
      else push('delete', x[i++]);
    }
  }
  push('same', end ? a.slice(a.length - end).join('') : '');
  return parts;
}
