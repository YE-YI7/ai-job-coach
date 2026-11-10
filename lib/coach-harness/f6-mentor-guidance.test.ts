import {currentF6MentorGuidance, F6_MENTOR_RESPONSIBILITY} from './f6-mentor-guidance';
import {F6ToolSession} from './f6-tool-session';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {F6HrReviewSession} from './f6-hr-review';
import {F6_ORIGIN_TOOLS} from './f6-tool-session';

const source = '负责客服需求和规则验收，与算法及后端一起交付问答项目。';
const input = {resume: source, jd: 'AI客服产品经理', facts: [{id: 'own', text: source}],
  answers: [], decisions: [], request: '', scope: 'whole' as const, format: {}, mentorCoaching: true as const};
const body = '负责客服问答的需求定义和规则验收，与算法及后端协作交付。';
const advice = '**这段可以体现交付推进，但“带团队”还没有依据。**\n\n先回忆一次上线卡点：你是协调人，还是负责其中一个模块？想不起可以先保留协作口径。';
const write = (text: string, guidance?: string) => JSON.stringify({type: 'native_tool_calls', content: '',
  tool_calls: [{id: 'w', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({files: [
    {name: 'resume-new.md', text}, ...(guidance ? [{name: 'changes.md', text: guidance}] : []),
  ]})}}]});

test('same author delivers optional coaching and the draft together with no extra model or new tool', async () => {
  const run = jest.fn().mockResolvedValue(write(body, advice));
  const output = JSON.parse(await runF6ResumeWriter(input, run, jest.fn()));
  expect(output.fullDocument).toBe(body);
  expect(currentF6MentorGuidance(output.f6Deliverables)).toBe(advice);
  expect(output.fullDocument).not.toContain('带团队');
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][3]).toEqual(F6_ORIGIN_TOOLS);
  expect(run.mock.calls[0][0].map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
  expect(run.mock.calls[0][0][0].content).toContain(F6_MENTOR_RESPONSIBILITY);
});

test('no gap does not force a question, a write tool, or an extra planning turn', async () => {
  const run = jest.fn().mockResolvedValue(body);
  const output = JSON.parse(await runF6ResumeWriter(input, run, jest.fn()));
  expect(output.fullDocument).toBe(body);
  expect(currentF6MentorGuidance(output.f6Deliverables)).toBeUndefined();
  expect(run).toHaveBeenCalledTimes(1);
});

test('coaching follows the delivered revision; HR revision cannot silently show first-draft advice', async () => {
  const hr = new F6HrReviewSession({resume: source, jd: input.jd, facts: source},
    jest.fn().mockResolvedValue('核实个人职责，不必补造管理经历。'));
  const revised = body + '保留人工退款边界。';
  const run = jest.fn().mockResolvedValueOnce(write(body, advice)).mockResolvedValueOnce(write(revised));
  const output = JSON.parse(await runF6ResumeWriter(input, run, jest.fn(), undefined, undefined, undefined, hr));
  expect(output.fullDocument).toBe(revised);
  expect(output.f6Deliverables.files['changes.md']).toBe(advice);
  expect(output.f6Deliverables.mentorGuidance.current).toBe(false);
  expect(currentF6MentorGuidance(output.f6Deliverables)).toBeUndefined();
  expect(hr.records).toHaveLength(1);
  expect(run).toHaveBeenCalledTimes(2);
});

test('updated coaching after HR is tied to the final body in the same call', async () => {
  const hr = new F6HrReviewSession({resume: source, jd: input.jd, facts: source},
    jest.fn().mockResolvedValue('只补一个真实交付案例，不要求数字。'));
  const next = '可以先回忆一份你定过的验收表，不需要编提升比例。你当时定的第一项规则是什么？';
  const run = jest.fn().mockResolvedValueOnce(write(body, advice)).mockResolvedValueOnce(write(body + '负责规则验收。', next));
  const output = JSON.parse(await runF6ResumeWriter(input, run, jest.fn(), undefined, undefined, undefined, hr));
  expect(currentF6MentorGuidance(output.f6Deliverables)).toBe(next);
});

test('historical unversioned files and stale receipts are not active mentor instructions', () => {
  const old = {files: {'changes.md': '旧版本变更日志'}, resumeRevision: 1, renderedRevision: -1};
  expect(currentF6MentorGuidance(old)).toBeUndefined();
  expect(currentF6MentorGuidance({...old, mentorGuidance: {
    version: 1, text: advice, resumeRevision: 0, current: true,
  }})).toBeUndefined();
});

test('only enabled production semantics use changes.md as coaching; catalogue remains origin-frozen', async () => {
  const old = new F6ToolSession(input, () => []);
  const current = new F6ToolSession(input, () => [], undefined, undefined, undefined, true);
  const files = [{name: 'changes.md', text: advice}, {name: 'resume-new.md', text: body}];
  await old.invoke('write_output', {files}); await current.invoke('write_output', {files});
  expect(old.deliverables().mentorGuidance).toBeUndefined();
  expect(currentF6MentorGuidance(current.deliverables())).toBe(advice);
  expect(current.availableTools()).toEqual(old.availableTools());
});

test('previous teaching enters author context as an AI hypothesis, not a candidate fact', () => {
  const messages = f6InitialMessages({...input, previousMentorGuidance: advice,
    answers: [{answer: '我没有带团队，只负责规则验收。'}]});
  const payload = JSON.parse(messages[1].content);
  expect(payload.previousMentorGuidance.text).toBe(advice);
  expect(payload.previousMentorGuidance.provenance).toContain('不是候选人事实');
  expect(payload['facts.md']).toEqual(input.facts);
  expect(payload.answers[0].answer).toContain('没有带团队');
});
