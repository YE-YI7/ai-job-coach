import {compactEvalTranscript, expandEvalTranscript} from './eval-transcript-storage';

test('12 cumulative turns fit the existing database limit with every message recoverable', () => {
  const messages = [{role: 'user', content: '虚构简历'.repeat(7000)}];
  const spans = Array.from({length: 12}, (_, index) => {
    messages.push({role: 'tool', content: `fictional receipt ${index}`.repeat(1500)});
    return {id: 'turn-' + index, input: {messages: [...messages]}, output: 'actual output ' + index};
  });
  const original = {status: 'failed', result: {status: 'failed'}, spans};
  const before = JSON.stringify(original);
  expect(Buffer.byteLength(before)).toBeGreaterThan(1500000);
  const stored = compactEvalTranscript(original);
  expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(1000000);
  expect(expandEvalTranscript(stored)).toEqual(original);
  expect(JSON.stringify(original)).toBe(before);
  expect(compactEvalTranscript(stored)).toEqual(stored);
});

test('changed messages, tools, ordering and error outputs are byte-preserved', () => {
  const run = {spans: [
    {id: 'a', input: {messages: ['same', 'original']}, output: 'first'},
    {id: 'b', input: {messages: ['same', 'changed'], options: {tools: ['read']}}, output: {error: 'failed'}},
    {id: 'c', input: {messages: ['completely different']}},
  ]};
  expect(expandEvalTranscript(compactEvalTranscript(run))).toEqual(run);
  expect(expandEvalTranscript(run)).toBe(run);
});

test('broken references do not silently manufacture or hide an input', () => {
  expect(() => expandEvalTranscript({captureEncoding: 'message-prefix-v1', spans: [
    {id: 'b', input: {messages: [], messagesPrefix: {spanId: 'missing', count: 1}}},
  ]})).toThrow('EVAL_TRANSCRIPT_REFERENCE_INVALID');
});

test('large PDF binaries become explicit artifact receipts without changing text or the live response', () => {
  const base64 = Buffer.alloc(1800000, 'a').toString('base64');
  const output = {fullDocument: '最终新稿', f6Deliverables: {
    pdf: {base64, revision: 'old-revision', current: false, pages: 3}, notes: '作者记录',
  }};
  const spans = [{id: 'first', input: {messages: ['完整输入']}, output: '完整模型输出'},
    {id: 'second', input: {messages: ['完整输入', '工具回执']}, output: '作者返修'}];
  const run = {spans, result: {output, rawResponse: output}};
  const stored = compactEvalTranscript(run);
  expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(10000);
  const expanded = expandEvalTranscript(stored);
  expect(expanded.spans).toEqual(spans);
  const result = expanded.result as {output: typeof output & {f6Deliverables: {pdf: {binaryReceipt: unknown}}}};
  expect(result.output.fullDocument).toBe('最终新稿');
  expect(result.output.f6Deliverables.pdf).toMatchObject({revision: 'old-revision', current: false,
    binaryReceipt: {bytes: 1800000, omittedFromTrace: true, sha256: expect.stringMatching(/^[a-f0-9]{64}$/)}});
  expect(result.output.f6Deliverables.pdf).not.toHaveProperty('base64');
  expect(output.f6Deliverables.pdf.base64).toBe(base64);
  expect(compactEvalTranscript(stored)).toEqual(stored);
});
