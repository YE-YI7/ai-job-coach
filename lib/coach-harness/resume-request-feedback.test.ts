import { readFileSync } from 'node:fs';
import { resumeRequestFeedback } from './resume-request-feedback';
import { classifyResumeDelivery } from './resume-delivery';
import type { ResumeAgentTask } from './resume-task-types';

const task: ResumeAgentTask = {
  id: 'task', state: 'ready', question: null, answers: [], updatedAt: '2026-11-09T14:24:48Z',
  result: { resumeGenerationId: 'task:4', changes: [{
    id: 'old', section: '项目', before: '旧文', after: '旧建议', reason: '旧结果', status: 'accepted', evidenceId: 'fixture-evidence',
  }] },
};
test('the confirmed generation button never guesses start from an unloaded task', () => {
  const source = readFileSync('components/cockpit/CockpitApp.tsx', 'utf8');
  const generate = source.split('const generateResumeDraft =')[1].split('const supplementResumeDraft =')[0];
  expect(generate).toContain("runResumeAgent('restart',undefined,active,undefined,undefined,trial)");
  expect(generate).not.toContain('resumeAgentTasks[');
  expect(source).toContain('announce(resumeRequestFeedback(result,action))');
  expect(source).toContain('onContinue={()=>runResumeAgent("retry")}');
});
test('old ready replay is never reported as new work or a no-change model judgment', () => {
  expect(resumeRequestFeedback({ ok: true, task, replayed: true }, 'start')).toContain('本次没有生成新稿');
});
test.each(['running', 'needs_detail', 'failed', 'idle'] as const)('non-ready %s is not completion', state => {
  expect(resumeRequestFeedback({ ok: true, task: { ...task, state } }, 'restart')).not.toContain('修改建议已保存');
});
test('empty, unchanged and unconfirmed results cannot claim new modifications', () => {
  expect(resumeRequestFeedback({ ok: true, task: { ...task, result: { changes: [] } } }, 'restart')).toContain('没有返回');
  expect(resumeRequestFeedback({ ok: true, task: { ...task, result: { ...task.result!, unchanged: true } } }, 'restart')).toContain('没有新增');
  const delivery = classifyResumeDelivery({ taskState: 'ready', persisted: false });
  expect(resumeRequestFeedback({ ok: true, task: { ...task, delivery } }, 'restart')).toContain('尚未确认保存');
});
test('a saved zero-diff receipt and partial delivery retain their actual meanings', () => {
  const unchanged = classifyResumeDelivery({ taskState: 'ready', persisted: true, newChangeCount: 0 });
  expect(resumeRequestFeedback({ ok: true, task: { ...task, delivery: unchanged } }, 'restart')).toContain('没有新增');
  const partial = classifyResumeDelivery({ taskState: 'ready', persisted: true, newChangeCount: 1, hasUnresolved: true });
  expect(resumeRequestFeedback({ ok: true, task: { ...task, delivery: partial } }, 'restart')).toContain('部分修改');
});
test('discussion, skipped optional details and real saved suggestions stay distinct', () => {
  expect(resumeRequestFeedback({ ok: true, task, conversationDecision: 'discuss' }, 'message')).toBe('导师已回复，简历未改动');
  expect(resumeRequestFeedback({ ok: true, task, replayed: true }, 'skip')).toContain('已跳过');
  expect(resumeRequestFeedback({ ok: true, task }, 'restart')).toContain('本轮修改建议已保存');
});
