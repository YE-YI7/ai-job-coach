import {createHash} from 'node:crypto';
import {f6TemporalRoleContract} from './f6-temporal-responsibility';
import {f6AuthorContract} from './f6-author-contract';
import {f6ScreeningPrompt, f6ScreeningMessages, F6_SCREENING_PROMPT} from './f6-screening-review';
import {f6RuntimeIdentity} from './f6-runtime-contract';
import {F6ContextTools} from './f6-context-tools';
import {F6ToolSession} from './f6-tool-session';
import {F6HrReviewSession} from './f6-hr-review';
import {f6InitialMessages, runF6ResumeWriter, F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';
import type {LlmMessage} from '@/lib/llm-tools';

const savedRole = process.env.F6_TEMPORAL_ROLE_CONTRACT;
const savedClock = process.env.F6_CURRENT_TIME_TOOL;
const currentDate = '2026-11-15T12:00:00.000Z';
const source = '林舟（虚构测试）\n本科在读｜2022.09—预计2026.06\n参与工单助手，制作流程图并参与测试。';
const contexts = () => new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined,
  {complete: true, documents: []});
const input = () => ({resume: source, jd: '', facts: [], request: '', answers: [], decisions: [],
  scope: 'whole' as const, format: {}, mentorCoaching: true as const, contextTools: contexts()});
const native = (name: string, args: unknown) => JSON.stringify({type: 'native_tool_calls', content: '',
  tool_calls: [{id: 'call-' + name, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

beforeEach(() => {
  delete process.env.F6_TEMPORAL_ROLE_CONTRACT;
  process.env.F6_CURRENT_TIME_TOOL = 'v1';
  jest.useFakeTimers(); jest.setSystemTime(new Date(currentDate));
});
afterEach(() => {
  if (savedRole === undefined) delete process.env.F6_TEMPORAL_ROLE_CONTRACT;
  else process.env.F6_TEMPORAL_ROLE_CONTRACT = savedRole;
  if (savedClock === undefined) delete process.env.F6_CURRENT_TIME_TOOL;
  else process.env.F6_CURRENT_TIME_TOOL = savedClock;
  jest.useRealTimers(); jest.restoreAllMocks();
});

test('candidate is opt-in and replaces responsibility sections instead of appending competing rules', () => {
  const baseline = f6AuthorContract('whole');
  expect(f6TemporalRoleContract()).toBeUndefined();
  expect(f6ScreeningPrompt()).toBe(F6_SCREENING_PROMPT);
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'both-v1';
  const author = f6AuthorContract('whole'), hr = f6ScreeningPrompt();
  expect(author).not.toBe(baseline);
  expect(author.split('事实依据是当前原稿')).toHaveLength(2);
  expect(author.split('改稿与补问同轮交付')).toHaveLength(2);
  expect(author).toContain('过去发生的事实与依赖写作时点的当前状态');
  expect(author).toContain('已有参照就复用');
  expect(author).toContain('在右侧明确该现状仍待确认并问清');
  expect(author).toContain('不凭时钟删去原有学历限定或改成另一状态');
  expect(author).not.toContain('右侧只围绕最值得挖的个人价值');
  expect(hr).not.toContain('最该改善的一处表达或证据缺口');
  expect(hr).toContain('仍可建议约面');
  expect(hr).toContain('只陈述历史日期、没有现状疑点时，不制造时间问题');
});

test.each(['author-v1', 'hr-v1', 'both-v1'] as const)('roles can be independently varied: %s', variant => {
  const author = f6AuthorContract('whole'), hr = f6ScreeningPrompt();
  const baselineIdentity = f6RuntimeIdentity();
  process.env.F6_TEMPORAL_ROLE_CONTRACT = variant;
  expect(f6AuthorContract('whole') === author).toBe(variant === 'hr-v1');
  expect(f6ScreeningPrompt() === hr).toBe(variant === 'author-v1');
  const candidateIdentity = f6RuntimeIdentity();
  expect(candidateIdentity).toMatchObject({temporalRoleContract: variant,
    toolsSha256: baselineIdentity.toolsSha256,
    originSystemSha256: baselineIdentity.originSystemSha256,
    knowledgeCatalogueSha256: baselineIdentity.knowledgeCatalogueSha256,
    contextSpecificationSha256: baselineIdentity.contextSpecificationSha256,
    maxAuthorCalls: 12, maxHrCalls: 1, resumeModel: baselineIdentity.resumeModel});
});

test('author receives the same original material and tools, not an injected date, diagnosis or answer', () => {
  const first = f6InitialMessages(input());
  const tools = new F6ToolSession(input(), () => []).availableTools();
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'both-v1';
  const candidate = f6InitialMessages(input());
  expect(candidate[1]).toEqual(first[1]);
  expect(candidate[1].content).not.toContain('2026-11-15');
  expect(candidate[1].content).not.toContain('已经毕业');
  expect(digest(new F6ToolSession(input(), () => []).availableTools())).toBe(digest(tools));
  expect(JSON.parse(candidate[1].content).personalMaterials).toEqual([]);
});

test('HR still sees only the candidate and its dated hiring context, never original material or Memory', () => {
  const body = '投递新稿：本科在读｜预计2026.06毕业';
  const original = f6ScreeningMessages(body, '', '产品实习');
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'hr-v1';
  const changed = f6ScreeningMessages(body, '', '产品实习');
  expect(changed).toHaveLength(3);
  expect(changed.slice(1)).toEqual(original.slice(1));
  expect(JSON.parse(changed[1].content).asOfDateUtc).toBe('2026-11-15');
  expect(changed[2].content.endsWith(body)).toBe(true);
  expect(changed[0].content).toBe(f6ScreeningPrompt());
  expect(JSON.stringify(changed)).not.toContain('facts.md');
  expect(JSON.stringify(changed)).not.toContain('mentor.md');
});

test('no compulsory clock or extra model hop is inserted when the model directly hands in a draft', async () => {
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'both-v1';
  const run = jest.fn().mockResolvedValue(native('write_output', {resume_markdown: source, purpose: '直接交稿'}));
  const result = JSON.parse(await runF6ResumeWriter(input(), run, jest.fn()));
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(source);
  expect(F6_MAX_AUTHOR_CALLS).toBe(12);
});

test('chosen clock results reach the same author without becoming personal facts or a graduation decision', async () => {
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'author-v1';
  const value = input();
  const run = jest.fn()
    .mockResolvedValueOnce(native('get_current_time', {purpose: '核实当前状态所需的时点'}))
    .mockResolvedValueOnce(native('write_output', {resume_markdown: source, purpose: '保留已有材料'}));
  await runF6ResumeWriter(value, run, jest.fn());
  expect(run).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(run.mock.calls[1][0])).toContain('2026-11-15');
  expect(value.contextTools.evidence).toEqual([]);
});

test('replaying bad answers stays bad: no semantic parser silently fixes it or invents a mentor question', async () => {
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'both-v1';
  const authorMessages: LlmMessage[][] = [], reviewMessages: LlmMessage[][] = [];
  const author = jest.fn(async (messages: LlmMessage[]) => {
    authorMessages.push(structuredClone(messages));
    return native('write_output', {resume_markdown: source, notes_markdown: '教育按原稿保留',
      mentor_markdown: '项目里你做了什么判断？', purpose: '沿用原稿'});
  });
  const review = new F6HrReviewSession({resume: source + '\n原稿核源私有标记', jd: '', facts: '',
    reviewMode: 'recruiting_screen'}, async messages => {
    reviewMessages.push(structuredClone(messages)); return '可以约面，贡献仍可写清。';
  });
  const result = JSON.parse(await runF6ResumeWriter(input(), author, jest.fn(), undefined, undefined, undefined, review));
  expect(author).toHaveBeenCalledTimes(2);
  expect(reviewMessages).toHaveLength(1);
  expect(authorMessages.every(messages => messages[0].content.includes('过去发生的事实与依赖写作时点的当前状态'))).toBe(true);
  expect(reviewMessages[0][0].content).toBe(f6ScreeningPrompt());
  expect(JSON.stringify(reviewMessages)).not.toContain('原稿核源私有标记');
  expect(result.fullDocument).toBe(source);
  expect(result.f6Deliverables.files['mentor.md']).toBe('项目里你做了什么判断？');
  // This is wiring/replay evidence, not an assertion that a new model catches the bad case.
});
