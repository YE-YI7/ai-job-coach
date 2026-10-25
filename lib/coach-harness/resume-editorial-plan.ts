import type { ResumeChange } from '@/lib/opportunities/types';

export type ResumeEditorialPlan = {
  mainline: string;
  claims: Array<{ point: string; sourceIds: string[] }>;
  priorities: Array<{ id: string; before: string; goal: string }>;
};
export type ResumeNarrativeReview = {
  status: 'passed' | 'failed';
  mainlineSupported: boolean;
  summary: string;
  goals: Array<{ id: string; status: 'addressed' | 'keep_original' | 'not_addressed'; reason: string }>;
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max;
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every(key => allowed.includes(key));

/** A plan organizes evidence. Its prose never becomes citable career facts. */
export function readResumeEditorialPlan(raw: unknown, resume: string, sourceIds: Set<string>): ResumeEditorialPlan | null {
  if (!object(raw) || !keys(raw, ['mainline', 'claims', 'priorities']) || !text(raw.mainline, 8, 180)
    || !Array.isArray(raw.claims) || raw.claims.length < 1 || raw.claims.length > 3
    || !Array.isArray(raw.priorities) || raw.priorities.length < 1 || raw.priorities.length > 6) return null;
  for (const claim of raw.claims) {
    if (!object(claim) || !keys(claim, ['point', 'sourceIds']) || !text(claim.point, 8, 180)
      || !Array.isArray(claim.sourceIds) || !claim.sourceIds.length || claim.sourceIds.length > 6
      || claim.sourceIds.some(id => typeof id !== 'string' || !sourceIds.has(id))) return null;
  }
  const ids = new Set<string>(), spans = new Set<string>();
  for (const priority of raw.priorities) {
    if (!object(priority) || !keys(priority, ['id', 'before', 'goal'])
      || typeof priority.id !== 'string' || !/^p[1-6]$/.test(priority.id) || ids.has(priority.id)
      || !text(priority.before, 8, 2000) || !resume.includes(priority.before)
      || resume.indexOf(priority.before) !== resume.lastIndexOf(priority.before)
      || [...spans].some(span => span.includes(priority.before as string) || String(priority.before).includes(span))
      || !text(priority.goal, 8, 180)) return null;
    ids.add(priority.id); spans.add(priority.before);
  }
  return raw as ResumeEditorialPlan;
}

/** Signals, not a semantic judge: a renamed lead-in cannot prove body improvement.
 * Corrections may still be useful, but must not be labelled substantive content. */
export function resumeContentDelta(before: string, after: string) {
  const body = (value: string) => value
    .replace(/^\s*[-*•]\s*/gm, '')
    .replace(/^\*\*[^*\n]{1,80}\*\*[：:。.]?\s*/gm, '');
  const normalize = (value: string) => value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
  const surface = (value: string) => normalize(value).replace(/把|将/g, '').replace(/和|与/g, '和');
  if (normalize(before) === normalize(after)) return 'surface_only' as const;
  if (surface(body(before)) === surface(body(after))) return 'lead_or_surface_only' as const;
  return 'body_changed' as const;
}

export function readResumeNarrativeReview(raw: unknown, plan: ResumeEditorialPlan): ResumeNarrativeReview | null {
  if (!object(raw) || !keys(raw, ['status', 'mainlineSupported', 'summary', 'goals'])
    || !['passed', 'failed'].includes(String(raw.status)) || typeof raw.mainlineSupported !== 'boolean'
    || !text(raw.summary, 8, 1200) || !Array.isArray(raw.goals) || raw.goals.length !== plan.priorities.length) return null;
  const ids = new Set(plan.priorities.map(priority => priority.id)), seen = new Set<string>();
  for (const goal of raw.goals) {
    if (!object(goal) || !keys(goal, ['id', 'status', 'reason']) || typeof goal.id !== 'string'
      || !ids.has(goal.id) || seen.has(goal.id) || !['addressed', 'keep_original', 'not_addressed'].includes(String(goal.status))
      || !text(goal.reason, 8, 500)) return null;
    seen.add(goal.id);
  }
  if (raw.status === 'passed' && (!raw.mainlineSupported || raw.goals.some(goal => goal.status === 'not_addressed'))) return null;
  if (raw.status === 'failed' && raw.mainlineSupported && raw.goals.every(goal => goal.status !== 'not_addressed')) return null;
  return raw as ResumeNarrativeReview;
}

/** Match goals against the ACTUALLY retained changes, not a discarded proposal. */
export function unresolvedResumeEditorialGoals(plan: ResumeEditorialPlan, review: ResumeNarrativeReview | null, changes: ResumeChange[]) {
  if (!review || !review.mainlineSupported) return plan.priorities;
  return plan.priorities.filter(priority => {
    const goal = review.goals.find(item => item.id === priority.id);
    if (goal?.status === 'keep_original') return false; // independent judgment, never the author's self-award
    if (goal?.status !== 'addressed') return true;
    return !changes.some(change => (priority.before.includes(change.before) || change.before.includes(priority.before))
      && resumeContentDelta(change.before, change.after) === 'body_changed');
  });
}

export const RESUME_NARRATIVE_REVIEW_PROMPT = `还要独立核对 editorialPlan。计划是编辑判断，不是事实来源：
1. 依据原简历、已确认指令和JD判断mainline是否成立，不因编辑写了主线就同意；不能把团队/提案/原型变成个人上线成果。
2. 每条priority逐项判断：addressed=最终保留稿已改善真实贡献、内容取舍、主次或可读结构；keep_original=原文已达目标且有具体理由；not_addressed=还没做到。不能靠改段首标题、把换将、同义词、标点或多写解释来凑addressed。
3. 对比前后信息：真正删了什么冗余、把哪个决策/交付从什么位置提出来、吸收了哪条本人补充？理由不能只是“更专业/突出能力/贴合定位”。不强求数字或编造事实。
4. contentDelta=surface_only/lead_or_surface_only时impact不能是content；若确实纠正了错误概括，可按correction检查，但不算本轮内容主线已完成。
额外返回 narrativeReview:{status:"passed|failed",mainlineSupported:true或false,summary:"实际依据",goals:[{id:"逐字复制priority id",status:"addressed|keep_original|not_addressed",reason:"具体判断"}]}，每个priority恰好一次。你只诊断不写替换稿，原编辑负责返修。`;
