import {resumeEditingContext, isCurrentResumeUnchanged} from './resume-editing-context';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {f6HrMessages} from './f6-hr-review';
import {applyResumeChanges} from './application-quality';
import {resumeConversationMessages} from './resume-conversation-decision';
import type {ResumeAgentAnswer} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

const original = '项目经历\n整理客户反馈，整理后交给同事核对。\n技能\nSQL';
const changes: ResumeChange[] = [{id: 'accepted', section: '项目', before: '整理客户反馈，整理后交给同事核对。',
  after: '整理客户反馈，交给同事核对。', status: 'accepted', reason: '精简重复', evidenceId: null}];
const source = {resume: original, changes, revision: 'r'};
const instruction: ResumeAgentAnswer = {id: 'old', kind: 'instruction', question: '修改要求', field: 'context',
  sourceExcerpt: '', answer: '只改这一句，不调整章节顺序。', savedAt: '2026-10-25T09:05:22Z'};
const task = {answers: [instruction]};
const current = applyResumeChanges(original, changes).text;
const tool = (name: string, args: unknown) => JSON.stringify({type: 'native_tool_calls', tool_calls: [{
  id: 'call-' + name, type: 'function', function: {name, arguments: JSON.stringify(args)},
}]});

test('restart keeps original history as reference without replaying it as the current request', () => {
  const snapshot = JSON.stringify({source, task});
  const context = resumeEditingContext(source, task, 'restart');
  expect(context.task).toMatchObject({action: 'restart', request: ''});
  expect(context.current.text).toBe(current);
  expect(context.instructionHistory).toEqual([{id: 'old', text: instruction.answer, savedAt: instruction.savedAt}]);
  expect(JSON.stringify({source, task})).toBe(snapshot);
});

test.each(['revise', 'conversation'])('a new %s instruction remains the explicit current request', action => {
  const next = {...instruction, id: 'new', answer: '按当前稿调整结构，不只改措辞。', savedAt: '2026-11-11T16:00:00Z'};
  const context = resumeEditingContext(source, {answers: [instruction, next]}, action);
  expect(context.task.request).toBe(next.answer);
  expect(context.instructionHistory).toHaveLength(2);
});

test.each(['accepted', 'rejected', 'pending'] as const)('the actual %s decision, not a stale model file, defines editing input', status => {
  const selected = changes.map(change => ({...change, status}));
  const context = resumeEditingContext({...source, changes: selected}, {...task, result: {
    changes, f6Deliverables: {files: {'resume-new.md': '过期生成稿'}, resumeRevision: 1, renderedRevision: -1},
  }}, 'restart');
  expect(context.current.text).toBe(applyResumeChanges(original, selected).text);
  expect(context.current.matchesLastGenerated).toBe(false);
});

test('unresolved anchors fail before a model call rather than silently falling back to the upload', () => {
  expect(() => resumeEditingContext({...source, changes: [{...changes[0], before: '不存在'}]}, task))
    .toThrow('当前简历无法完整读取');
});

test('initial prompt and read_file agree on the current draft; storage projection still uses immutable original anchors', async () => {
  const editingContext = resumeEditingContext(source, task, 'restart');
  const input = {resume: original, jd: '', facts: [{id: 'fact', text: original}], request: editingContext.task.request,
    answers: [], decisions: changes, scope: 'whole' as const, format: {}, editingContext};
  const payload = JSON.parse(f6InitialMessages(input)[1].content);
  expect(payload['resume.md']).toBe(current);
  expect(payload.source_reference_only['original-resume.md']).toBe(original);
  expect(payload.editingRequest).toBe('');
  expect(payload.priorDecisions).toEqual([{id: 'accepted', section: '项目', status: 'accepted'}]);
  const author = jest.fn().mockResolvedValueOnce(tool('read_file', {file: 'resume.md'}))
    .mockResolvedValueOnce(tool('write_output', {files: [{name: 'resume-new.md', text: current}]}));
  const delivered = JSON.parse(await runF6ResumeWriter(input, author, jest.fn()));
  const read = author.mock.calls[1][0].find((message: {role: string}) => message.role === 'tool');
  expect(JSON.parse(read.content).text).toBe(current);
  expect(delivered.changes[0].before).toBe(changes[0].before + '\n');
  expect(applyResumeChanges(original, delivered.changes).text).toBe(current);
});

test('HR sees the current comparison baseline separately from original evidence and the unique new target', () => {
  const messages = f6HrMessages({resume: original, currentResume: current, jd: '', facts: ''}, current);
  expect(messages[2].content.endsWith(original)).toBe(true);
  expect(messages.at(-2)!.content).toContain('仅比较，不是事实来源');
  expect(messages.at(-2)!.content.endsWith(current)).toBe(true);
  expect(messages.at(-1)!.content.endsWith(current)).toBe(true);
  expect(messages.filter(message => message.content.startsWith('唯一待评新稿'))).toHaveLength(1);
  const references = JSON.parse(messages[1].content);
  expect(references.sources).not.toHaveProperty('current-draft.md');
  expect(references.comparisonBaseline.purpose).toBe('comparison_only_not_factual_evidence');
});

test('no-op print formatting cannot make the freshly saved mentor question stale after refresh', () => {
  const guidance = '交付已清楚，核对时具体依据哪一项标准？';
  const payload = JSON.parse(resumeConversationMessages({...source, jd: ''}, {
    id: 'task', state: 'ready', question: null, answers: [], updatedAt: 'now',
    result: {changes, unchanged: true, f6Deliverables: {
      files: {'resume-new.md': current + '\n<!-- PAGEBREAK -->', 'mentor.md': guidance},
      resumeRevision: 1, renderedRevision: -1,
      mentorGuidance: {version: 1, text: guidance, current: true, resumeRevision: 1},
    }},
  }).messages[1].content);
  expect(payload.currentDraft.matchesLastGenerated).toBe(true);
  expect(payload.mentorGuidance.text).toBe(guidance);
});

test('pagebreak/whitespace cannot masquerade as new content; punctuation and actual structure still can change', () => {
  expect(isCurrentResumeUnchanged(current, current.replace('\n技能', '\n<!-- PAGEBREAK -->\n技能'))).toBe(true);
  expect(isCurrentResumeUnchanged(current, current.replace('交给', '交 给'))).toBe(true);
  expect(isCurrentResumeUnchanged(current, current.replace('，', '；'))).toBe(false);
  expect(isCurrentResumeUnchanged(current, current.replace('，', '\n- '))).toBe(false);
  expect(isCurrentResumeUnchanged(current, current.replace('同事', '客户'))).toBe(false);
});
