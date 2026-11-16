import {F6_CURRENT_TIME_TOOL, f6CurrentTime} from './f6-current-time';
import {F6ContextTools} from './f6-context-tools';
import {F6ToolSession} from './f6-tool-session';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import * as evalScope from './eval-scope';

const now = '2026-11-15T01:02:03.456Z';
const originalSwitch = process.env.F6_CURRENT_TIME_TOOL;
const memory = () => ({search: jest.fn(), read: jest.fn()});
const input = {resume: '虚构候选人\n本科｜2022.09—2026.06', jd: '', facts: [], request: '',
  answers: [], decisions: [], scope: 'whole' as const, format: {}, mentorCoaching: true as const};
const call = (name: string, args: unknown) => JSON.stringify({type: 'native_tool_calls', content: '',
  tool_calls: [{id: 'call-' + name, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});

beforeEach(() => {
  process.env.F6_CURRENT_TIME_TOOL = 'v1';
  jest.useFakeTimers(); jest.setSystemTime(new Date(now));
});
afterEach(() => {
  if (originalSwitch === undefined) delete process.env.F6_CURRENT_TIME_TOOL;
  else process.env.F6_CURRENT_TIME_TOOL = originalSwitch;
  jest.useRealTimers(); jest.restoreAllMocks();
});

test('current time comes from the server, not a model-supplied date', () => {
  expect(f6CurrentTime({now: '2025-01-01', asOfDateUtc: '2025-01-01'})).toEqual({
    source: 'server_clock', timestampUtc: now, asOfDateUtc: '2026-11-15',
    timeZone: 'UTC', localDate: '2026-11-15', localTime: '01:02:03', personalFacts: false,
  });
  expect(F6_CURRENT_TIME_TOOL.function.parameters.additionalProperties).toBe(false);
});

test('local time can cross a date boundary while the UTC reference remains explicit', () => {
  expect(f6CurrentTime({time_zone: 'America/Los_Angeles'})).toMatchObject({
    asOfDateUtc: '2026-11-15', timeZone: 'America/Los_Angeles',
    localDate: '2026-11-14', localTime: '17:02:03',
  });
  expect(f6CurrentTime({time_zone: 'Asia/Shanghai'})).toMatchObject({
    asOfDateUtc: '2026-11-15', localDate: '2026-11-15', localTime: '09:02:03',
  });
});

test.each(['', 'not-a-time-zone', 2026, 'x'.repeat(101)])('invalid zone stays an error: %p', time_zone => {
  expect(() => f6CurrentTime({time_zone})).toThrow('TIME_ZONE_INVALID');
});

test('time tool remains available when memory is fully loaded; no source or user status is added', async () => {
  const reader = memory(), contextTools = new F6ContextTools(reader, undefined, {complete: true, documents: []});
  const session = new F6ToolSession({...input, contextTools}, () => [], undefined, undefined, undefined, true);
  const tool = session.availableTools().find(item => item.function.name === 'get_current_time')!;
  expect(tool.function.parameters.required).toEqual(['purpose']);
  expect(tool.function.description).toContain('状态仍依据本人材料');
  expect(await session.invoke('get_current_time', {purpose: '确认教育结束日期与现在的关系'}))
    .toMatchObject({asOfDateUtc: '2026-11-15', personalFacts: false});
  expect(reader.search).not.toHaveBeenCalled();
  expect(reader.read).not.toHaveBeenCalled();
  expect(contextTools.evidence).toEqual([]);
  expect(JSON.stringify(f6InitialMessages({...input, contextTools}))).not.toContain('2026-11-15');
});

test('selected time result and purpose reach the next author input through the existing tool loop', async () => {
  const capture = jest.spyOn(evalScope, 'captureEvalStage');
  const contextTools = new F6ContextTools(memory());
  const run = jest.fn()
    .mockResolvedValueOnce(call('get_current_time', {purpose: '先确认当前日期，再处理教育经历的时态'}))
    .mockResolvedValueOnce(call('write_output', {resume_markdown: input.resume, purpose: '保留有据的学历和时间段'}));
  await runF6ResumeWriter({...input, contextTools}, run, jest.fn());
  expect(run).toHaveBeenCalledTimes(2);
  const following = run.mock.calls[1][0];
  expect(following).toContainEqual(expect.objectContaining({role: 'tool',
    content: expect.stringContaining('"asOfDateUtc":"2026-11-15"')}));
  expect(capture.mock.calls.some(args => args[1] === 'f6_tool_get_current_time')).toBe(true);
  expect(contextTools.evidence).toEqual([]);
});

test('availability does not force a time call or a new author hop', async () => {
  const run = jest.fn().mockResolvedValue(call('write_output', {
    resume_markdown: input.resume, purpose: '按已有材料直接交稿',
  }));
  await runF6ResumeWriter({...input, contextTools: new F6ContextTools(memory())}, run, jest.fn());
  expect(run).toHaveBeenCalledTimes(1);
});

test('unaccepted tool is not advertised or executable when the isolated candidate switch is off', async () => {
  delete process.env.F6_CURRENT_TIME_TOOL;
  const contextTools = new F6ContextTools(memory());
  const session = new F6ToolSession({...input, contextTools}, () => [], undefined, undefined, undefined, true);
  expect(session.availableTools().some(tool => tool.function.name === 'get_current_time')).toBe(false);
  await expect(session.invoke('get_current_time', {})).rejects.toThrow('CONTEXT_TOOL_NOT_AVAILABLE');
});
