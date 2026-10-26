import type { ResumeChange } from '@/lib/opportunities/types';
import { resumeBodyWithoutLeadIns, resumeLeadIn, resumeSourceParagraphs } from './resume-source-structure';
import { isTrivialRewrite } from './resume-diff';

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

/** Normal independent editing uses the plan; 0 is an explicit server rollback.
 * A public request body can never select a weaker review strategy. */
export function resumeNarrativeEnabled(strategy: string, mode?: 'narrative' | 'legacy') {
  return strategy === 'independent' && (mode
    ? mode === 'narrative' : process.env.RESUME_EDITORIAL_PLAN_ENABLED !== '0');
}

/** The model selects immutable source spans; it does not have to retype Markdown. */
export function resumeEditorialAnchors(resume: string) {
  return resumeSourceParagraphs(resume).filter(line => line.length >= 8)
    .map((before, index) => ({ anchorId: `a${index + 1}`, before }));
}

export function bindResumeEditorialAnchors(raw: Record<string, unknown>, resume: string) {
  const anchors = new Map(resumeEditorialAnchors(resume).map(anchor => [anchor.anchorId, anchor.before]));
  let invalid = false;
  const bind = (item: unknown) => {
    if (!object(item) || item.anchorId === undefined) return item;
    const before = typeof item.anchorId === 'string' ? anchors.get(item.anchorId) : undefined;
    if (!before || (item.before !== undefined && item.before !== before)) invalid = true;
    const { anchorId, ...rest } = item;
    void anchorId;
    return { ...rest, before: before || '' };
  };
  const plan = object(raw.editorialPlan) ? raw.editorialPlan : null;
  const output = {
    ...raw,
    ...(plan ? { editorialPlan: { ...plan,
      priorities: Array.isArray(plan.priorities) ? plan.priorities.map(bind) : plan.priorities,
    } } : {}),
    changes: Array.isArray(raw.changes) ? raw.changes.map(bind) : raw.changes,
  };
  return { anchorsValid: !invalid, output };
}

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
  const body = resumeBodyWithoutLeadIns;
  const normalize = (value: string) => value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
  const surface = (value: string) => normalize(value).replace(/把|将/g, '').replace(/和|与/g, '和');
  if (normalize(before) === normalize(after)) return 'surface_only' as const;
  if (surface(body(before)) === surface(body(after))) return 'lead_or_surface_only' as const;
  // A changed/removed label plus tiny OCR changes in its body is not content
  // selection. This signal never rejects useful corrections or new facts.
  const label = (value: string) => normalize(resumeLeadIn(value.split(/\r?\n/)[0])?.label || '');
  if (label(before) !== label(after)
    && isTrivialRewrite(body(before), body(after))) return 'lead_or_surface_only' as const;
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
1. mainlineSupported只判断主线命题是否有事实支持，不判断编辑是否把目标做好；后者由goals判断。不能照抄JD要求当成经历，不把团队/提案/原型变成个人上线成果。
2. 每条priority逐项判断：addressed=最终保留稿已改善真实贡献、内容取舍、主次或可读结构；keep_original=原文已达目标且有具体理由；not_addressed=还没做到。不能靠改段首标题、把换将、同义词、标点或多写解释来凑addressed。
3. 对比前后信息：真正删了什么冗余、把哪个决策/交付从什么位置提出来、吸收了哪条本人补充？理由不能只是“更专业/突出能力/贴合定位”。不强求数字或编造事实。
4. contentDelta=surface_only/lead_or_surface_only时impact不能是content；若确实纠正了错误概括，可按correction检查，但不算本轮内容主线已完成。
5. 内容优化不等于新增事实。压缩重复职责、删除冗长愿景以突出原有角色/交付、将埋在过程中的主要判断前置，都可有concision/structure价值；必须说清实际删减或主次变化，不能仅因“这些事实原来就有”否定，也不能把只删一个连接词当成精简成功。
6. 目标若原文已达到，具体说明keep_original，而不是因为没有改它就填not_addressed。发现原文已清楚是独立判断，不要求编辑为凑计划硬改；但真实未完成的目标不能这样豁免。
7. 精简需指出实际消除的重复或改变的信息主次，不能把删一个修饰词包装为content；实验结果中的显著性、稳定性和因果限定不是为了简洁随意删除的赘词。不同项目的阶段、动作不能汇总成每个项目都独立完成闭环。
8. 独立反证编辑理由：所谓“压缩工具”必须真的改了工具堆叠，不是删业务问题；所谓“前置交付”必须真的改变主次。具体误判/失效机制解释了方案选择，不是宏观背景；删去后只剩工具/结果应退回。保留框架编号却删掉其含义也不算精简成功。主线不能把原型/上线前测试说成完整落地能力。
额外返回 narrativeReview:{status:"passed|failed",mainlineSupported:true或false,summary:"实际依据",goals:[{id:"逐字复制priority id",status:"addressed|keep_original|not_addressed",reason:"具体判断"}]}，每个priority恰好一次。mainlineSupported=false或任一goal=not_addressed时，narrativeReview.status必须failed，不可同时声称通过。你只诊断不写替换稿，原编辑负责返修。`;
