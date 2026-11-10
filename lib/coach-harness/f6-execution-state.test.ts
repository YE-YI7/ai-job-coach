import {readFileSync} from 'node:fs';
import {f6CallMessages} from './f6-execution-state';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import type {LlmMessage} from '@/lib/llm-tools';
import {compactEvalTranscript, expandEvalTranscript} from './eval-transcript-storage';

const input = {resume: '参与评测，整理120条用例。', jd: '评测能力', facts: [], request: '',
  answers: [], decisions: [], scope: 'whole' as const, format: {}};
const read = (id: string, file: string) => JSON.stringify({type: 'native_tool_calls', tool_calls: [
  {id, type: 'function', function: {name: 'read_file', arguments: JSON.stringify({file})}},
]});
const receipt = (id: string, text = '完整的原始事实。'): LlmMessage => ({role: 'tool', tool_call_id: id,
  content: JSON.stringify({file: 'facts.md', text})});

test('accepted first request stays exact; continuation receives actual remaining calls', () => {
  const initial = f6InitialMessages(input);
  expect(f6CallMessages(initial, 0, 12)).toEqual(initial);
  const history = [...initial, receipt('a'), receipt('b')];
  const original = JSON.stringify(history);
  const messages = f6CallMessages(history, 7, 12);
  expect(JSON.parse(messages[2].content).text).toBe('完整的原始事实。');
  const last = JSON.parse(messages[3].content);
  expect(last.text).toBeUndefined();
  expect(last.textReference.toolCallId).toBe('a');
  expect(last.readStatus).toBe('already_read_unchanged');
  expect(last.executionState.authorCalls).toEqual({limit: 12, completed: 7, remainingIncludingThisCall: 5});
  expect(last.executionState.readFiles[0].reads).toBe(2);
  expect(last.executionState.duplicateReads).toBe(1);
  expect(JSON.stringify(history)).toBe(original);
});

test('changed text, errors and non-reading output are never treated as a cached read', () => {
  const history = [receipt('a'), receipt('b', '新的已确认事实。'),
    {role: 'tool' as const, tool_call_id: 'c', content: JSON.stringify({error: 'read failed'})}];
  const messages = f6CallMessages(history, 2, 12);
  expect(JSON.parse(messages[1].content).text).toBe('新的已确认事实。');
  expect(JSON.parse(messages[2].content).error).toBe('read failed');
  expect(JSON.parse(messages[2].content).executionState.duplicateReads).toBe(0);
});

test('same author may reread then write, without tool removal, required order or additional call', async () => {
  const run = jest.fn().mockResolvedValueOnce(read('a', 'S006'))
    .mockResolvedValueOnce(read('b', 'S006')).mockResolvedValueOnce('整理120条评测用例。');
  const output = JSON.parse(await runF6ResumeWriter(input, run, jest.fn()));
  expect(output.fullDocument).toBe('整理120条评测用例。');
  expect(run).toHaveBeenCalledTimes(3);
  expect(run.mock.calls[2][3]).toEqual(run.mock.calls[0][3]);
  const last = JSON.parse(run.mock.calls[2][0].at(-1).content);
  expect(last.textReference.toolCallId).toBe('a');
  expect(last.executionState.authorCalls.remainingIncludingThisCall).toBe(10);
});

test('repeat loop remains a failure, not a fabricated draft or extra billable retry', async () => {
  const run = jest.fn().mockResolvedValue(read('a', 'S006'));
  await expect(runF6ResumeWriter(input, run, jest.fn())).rejects.toThrow('F6_AUTHOR_CALL_BUDGET_EXHAUSTED');
  expect(run).toHaveBeenCalledTimes(12);
  expect(JSON.parse(run.mock.calls[11][0].at(-1).content).executionState.authorCalls.remainingIncludingThisCall).toBe(1);
});

const fixture = process.env.F6_PRIVATE_REPLAY_FILE;
(fixture ? test : test.skip)('actual failed Trace replays losslessly, with state and no upstream call', () => {
  const audit = JSON.parse(readFileSync(fixture!, 'utf8'));
  const run = audit.runs[0].run;
  const agents = run.spans.filter((span: {kind: string}) => span.kind === 'agent');
  expect(agents).toHaveLength(11);
  for (const [index, span] of agents.entries()) {
    const history = span.input.messages as LlmMessage[];
    const messages = f6CallMessages(history, index, 12);
    expect(messages[0]).toEqual(history[0]);
    const originals = new Map(messages.filter(m => m.role === 'tool').map(m => [m.tool_call_id, JSON.parse(m.content)]));
    for (const message of messages.filter(m => m.role === 'tool')) {
      const data = JSON.parse(message.content);
      if (data.textReference) {
        const old = history.find(m => m.role === 'tool' && m.tool_call_id === message.tool_call_id)!;
        expect(originals.get(data.textReference.toolCallId).text).toBe(JSON.parse(old.content).text);
      }
    }
  }
  const stored = compactEvalTranscript(run);
  expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(500000);
  expect(expandEvalTranscript(stored)).toEqual(run);
});
