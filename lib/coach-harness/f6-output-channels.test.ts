import {createHash} from 'node:crypto';
import origin from './f6-origin.json';
import {F6_MENTOR_TOOLS} from './f6-output-channels';
import {F6ToolSession} from './f6-tool-session';
import {currentF6MentorGuidance} from './f6-mentor-guidance';
import {f6ReviewHints} from './f6-review-hints';

const input = {resume: '李青\n教育：信息管理本科。\n负责规则验收。', jd: '', facts: []};
const session = () => new F6ToolSession(input, () => [], undefined, undefined, undefined, true);
const guidance = '这项判断值得展开：当时你用什么证据决定先处理这个问题？记不清也可以先保留已知事实。';

test('origin tools stay frozen; product explicitly advertises the mentor file on the same write capability', () => {
  expect(createHash('sha256').update(JSON.stringify(origin.tools)).digest('hex'))
    .toBe('a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d');
  expect(F6_MENTOR_TOOLS.map(tool => tool.function.name)).toEqual(origin.tools.map(tool => tool.function.name));
  for (const tool of F6_MENTOR_TOOLS.filter(item => item.function.name !== 'write_output')) {
    expect(tool).toEqual(origin.tools.find(item => item.function.name === tool.function.name));
  }
  const write = F6_MENTOR_TOOLS.find(tool => tool.function.name === 'write_output')!;
  expect(write.function.description).toContain('changes.md are internal');
  expect(write.function.description).toContain('mentor.md is an optional direct message');
  expect(JSON.stringify(write.function.parameters)).toContain('mentor.md');
});

test('all six optional files fit one call; only explicit mentor text becomes a versioned user message', async () => {
  const active = session();
  const files = ['portrait.md', 'battle.md', 'resume-new.md', 'changes.md', 'notes.md', 'mentor.md']
    .map(name => ({name, text: name === 'resume-new.md' ? input.resume
      : name === 'mentor.md' ? guidance : '内部报告：已按规格完成。'}));
  const receipt = await active.invoke('write_output', {files});
  expect(receipt.saved).toEqual(files.map(file => file.name));
  expect(currentF6MentorGuidance(active.deliverables())).toBe(guidance);
  expect(active.deliverables().files['changes.md']).toContain('内部报告');
});

test('an explicit legacy change report stays saved internally, not misrepresented as coaching', async () => {
  const active = session();
  await active.invoke('write_output', {files: [
    {name: 'resume-new.md', text: input.resume}, {name: 'changes.md', text: '已修改三处，HR建议已反驳。'},
  ]});
  expect(active.deliverables().files['changes.md']).toContain('HR建议');
  expect(currentF6MentorGuidance(active.deliverables())).toBeUndefined();
  expect(active.deliveryState().mentorMessage.saved).toBe(false);
});

test('a subsequent internal report cannot erase a useful current mentor message', async () => {
  const active = session();
  await active.invoke('write_output', {files: [
    {name: 'resume-new.md', text: input.resume}, {name: 'mentor.md', text: guidance},
  ]});
  await active.invoke('write_output', {files: [{name: 'changes.md', text: '已核对HR。'}]});
  expect(currentF6MentorGuidance(active.deliverables())).toBe(guidance);
  expect(active.deliverables().resumeRevision).toBe(1);
});

test('historical explicitly versioned guidance remains readable without rewriting old files or answers', () => {
  const old = {files: {'changes.md': guidance}, resumeRevision: 1, renderedRevision: -1,
    mentorGuidance: {version: 1 as const, text: guidance, resumeRevision: 1, current: true}};
  expect(currentF6MentorGuidance(JSON.parse(JSON.stringify(old)))).toBe(guidance);
});

test('legacy experiment transport does not silently acquire a new output name', async () => {
  const old = new F6ToolSession(input, () => []);
  expect(old.availableTools()).toEqual(origin.tools);
  await expect(old.invoke('write_output', {files: [{name: 'mentor.md', text: guidance}]}))
    .rejects.toThrow('OUTPUT_SCOPE_OR_SIZE_INVALID');
  await expect(session().invoke('write_output', {files: [{name: '../mentor.md', text: guidance}]}))
    .rejects.toThrow('OUTPUT_SCOPE_OR_SIZE_INVALID');
});

test('complete source/candidate evidence retains deletions even when the retained text raises no numeric hint', () => {
  const candidate = '李青\n负责规则验收。';
  const hints = f6ReviewHints(input.resume, candidate, [{id: 'source', text: input.resume}]);
  expect(hints.passages.some(part => part.before.includes('信息管理本科'))).toBe(true);
  expect(hints.passages.every(part => part.notices.length === 0)).toBe(true);
  // Context for a reviewer, not a programmatic mandate to restore or reject.
  expect(hints.policy).toBe('mechanical_hints_not_verdict');
});
