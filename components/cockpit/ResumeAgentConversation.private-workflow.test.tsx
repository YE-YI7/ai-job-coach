import React from 'react';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import ResumeAgentConversation from './ResumeAgentConversation';
import ResumeComposerModel from './ResumeComposerModel';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';

jest.mock('./TutorMarkdown', () => ({__esModule: true,
  default: ({children}: {children: string}) => <p>{children}</p>}));

const coaching = '这里的次数与人数需要你确认：8次访谈涉及几位销售？';
const task: ResumeAgentTask = {
  id: 'private-workflow-fixture', state: 'ready', question: null, answers: [], updatedAt: '2026-11-14T00:00:00Z',
  processing: {traceId: 'internal-trace-id', outcome: 'completed', elapsedMs: 1000,
    stages: ['内部HR审查'], materials: ['当前简历'], knowledge: [{id: 'private-method', title: '内部选材方法'}],
    checks: [{label: '内部核对', status: 'performed'}], changedCount: 1, saved: true},
  result: {changes: [], summary: '内部选材和HR返修说明',
    applicationQuality: {artifactId: 'private-result', version: 1, status: 'draft',
      reviews: [{reviewerType: 'independent_ai', status: 'warning', summary: '独立 HR 点评：内部原话'}]},
    f6Deliverables: {files: {'notes.md': '内部取舍回执', 'mentor.md': coaching},
      resumeRevision: 1, renderedRevision: -1,
      mentorGuidance: {version: 1, text: coaching, resumeRevision: 1, current: true}}},
};
const noop = async () => {};
const render = (value: ResumeAgentTask) => renderToStaticMarkup(
  <ResumeComposerModel.Provider value={{mode: 'auto', control: <span>保留模型选择</span>}}>
    <ResumeAgentConversation task={value} busy={false} pendingCount={1}
      onMessage={noop} onContinue={noop} onSkip={noop}/>
  </ResumeComposerModel.Provider>,
);

test('ordinary résumé conversation shows user coaching and model choice, never private processing or HR reports', () => {
  const before = JSON.stringify(task);
  const html = render(task);
  expect(html).toContain(coaching);
  expect(html).toContain('保留模型选择');
  expect(html).toContain('给简历导师发消息');
  for (const internal of ['内部HR审查', '内部选材方法', '内部核对', 'internal-trace-id',
    '内部选材和HR返修说明', '内部取舍回执', '独立 HR 点评', '本次简历处理记录', '查看本轮修改说明', '独立质检']) {
    expect(html).not.toContain(internal);
  }
  expect(JSON.stringify(task)).toBe(before);
});

test('existing discussion and pending/failure states survive the presentation-only change', () => {
  const historical = {...task, conversation: [{id: 'old-turn', message: '这是我当时留下的访谈记录',
    reply: '我会结合这份记录继续看。', status: 'completed' as const, decision: 'discuss' as const, savedAt: task.updatedAt}]};
  expect(render(historical)).toContain('这是我当时留下的访谈记录');
  expect(render(historical)).toContain('我会结合这份记录继续看。');
  expect(render({...task, state: 'running'})).toContain('正在修改你的简历');
  expect(render({...task, state: 'failed', error: '暂时失败'})).toContain('这次修改没有完成');
});

test('the résumé document no longer mounts a raw HR commentary widget', () => {
  expect(readFileSync(join(__dirname, 'CockpitApp.tsx'), 'utf8')).not.toContain('ResumeHrCommentary');
});

// Private, opt-in read-only replay; CI does not need a user's local files.
const actualTaskPath = process.env.F6_UI_REPLAY_TASK;
(actualTaskPath ? test : test.skip)('the actual saved task retains HR evidence but does not render it to the job seeker', () => {
  const actual: ResumeAgentTask = JSON.parse(readFileSync(actualTaskPath!, 'utf8'));
  const before = JSON.stringify(actual);
  const html = render(actual);
  const guidance = actual.result?.f6Deliverables?.mentorGuidance?.text;
  expect(guidance).toBeTruthy();
  expect(html).toContain(renderToStaticMarkup(<p>{guidance}</p>));
  expect(actual.result?.applicationQuality?.reviews.some(review => review.summary.startsWith('独立 HR 点评'))).toBe(true);
  expect(html).not.toContain('独立 HR 点评');
  expect(html).not.toContain('查看本轮修改说明');
  expect(html).not.toContain('本次简历处理记录');
  expect(JSON.stringify(actual)).toBe(before);
});
