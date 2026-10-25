import {
  readResumeEditorialPlan, readResumeNarrativeReview, resumeContentDelta, unresolvedResumeEditorialGoals,
  type ResumeEditorialPlan,
} from './resume-editorial-plan';
import { resumeEditorialCoreMethod } from '@/lib/knowledge/resume-methods';

const before = '- **检查交付。** 编写验收步骤，检查文件能否生成、能否打开。';
const plan: ResumeEditorialPlan = {
  mainline: '通过验收步骤与可打开文件证明真实交付能力',
  claims: [{ point: '编写验收步骤，验证文件能否被使用', sourceIds: ['s1'] }],
  priorities: [{ id: 'p1', before, goal: '突出已有验收步骤与交付可用性，不只是改标题' }],
};
test('plans bind source IDs and exact original spans, never become career claims', () => {
  expect(readResumeEditorialPlan(plan, before, new Set(['s1']))).toEqual(plan);
  expect(readResumeEditorialPlan({ ...plan, claims: [{ point: '编写步骤证明交付能力', sourceIds: ['not-provided'] }] }, before, new Set(['s1']))).toBeNull();
  expect(readResumeEditorialPlan({ ...plan, priorities: [{ ...plan.priorities[0], before: '原文没有这段，因此不得作为实际范围' }] }, before, new Set(['s1']))).toBeNull();
  expect(readResumeEditorialPlan({ ...plan, priorities: [plan.priorities[0], plan.priorities[0]] }, before, new Set(['s1']))).toBeNull();
  expect(readResumeEditorialPlan({ ...plan, after: '越权内容' }, before, new Set(['s1']))).toBeNull();
});
test('renaming a bold lead or swapping particles is not a substantive body delta', () => {
  expect(resumeContentDelta(before, before.replace('**检查交付。**', '**验收交付。**'))).toBe('lead_or_surface_only');
  expect(resumeContentDelta('- **调整方案。** 把原方案调整为可见文件列表。', '- **方案取舍。** 将原方案调整为可见文件列表。')).toBe('lead_or_surface_only');
  expect(resumeContentDelta('掌握Excel。可阅读英文。', '掌握Excel；可阅读英文。')).toBe('surface_only');
  expect(resumeContentDelta(before, '- **验收交付。** 编写验收步骤，验证生成文件能否打开。')).toBe('body_changed');
});
test('independent goals are exhaustive and consistent, not assumed passed', () => {
  const good = { status: 'passed', mainlineSupported: true, summary: '原文动作与文件交付可以支持这条主线', goals: [{ id: 'p1', status: 'addressed', reason: '真实交付与验收步骤关系更清楚' }] };
  expect(readResumeNarrativeReview(good, plan)).not.toBeNull();
  expect(readResumeNarrativeReview({ ...good, goals: [] }, plan)).toBeNull();
  expect(readResumeNarrativeReview({ ...good, mainlineSupported: false }, plan)).toBeNull();
  expect(readResumeNarrativeReview({ ...good, goals: [{ ...good.goals[0], id: 'unknown' }] }, plan)).toBeNull();
});
test('a discarded or renamed-only edit cannot fulfil a narrative goal', () => {
  const review = readResumeNarrativeReview({ status: 'passed', mainlineSupported: true,
    summary: '验收与实际交付主线有原文证据', goals: [{ id: 'p1', status: 'addressed', reason: '已调整正文突出可用交付的检验' }] }, plan)!;
  const change = { id: 'c1', section: '项目', before, after: before.replace('**检查交付。**', '**验收交付。**'),
    reason: '改标题', status: 'pending' as const, evidenceId: 's1' };
  expect(unresolvedResumeEditorialGoals(plan, review, [change])).toEqual(plan.priorities);
  expect(unresolvedResumeEditorialGoals(plan, review, [])).toEqual(plan.priorities);
  expect(unresolvedResumeEditorialGoals(plan, { ...review, goals: [{ ...review.goals[0], status: 'keep_original', reason: '原文已有清晰动作与检验对象，不需要重复表达' }] }, [])).toEqual([]);
});
test('a concise knowledge excerpt is explicit, bounded and not a full-document retrieval claim', () => {
  const core = resumeEditorialCoreMethod();
  expect(core.id).toBe('resume.factual-rewriting.v1#editorial-core');
  expect(core.content.length).toBeLessThan(1800);
  expect(core.content).toContain('1–3 个命题');
  expect(core.content).toContain('不是经历事实');
});
