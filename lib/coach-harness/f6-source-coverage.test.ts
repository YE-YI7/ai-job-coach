import {f6ReviewHints} from './f6-review-hints';
import {f6ReviewReferences} from './f6-review-references';
import {f6HrMessages, F6HrReviewSession} from './f6-hr-review';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expandEvalTranscript} from './eval-transcript-storage';
import {buildChatCompletionRequest} from '@/lib/llm';
import {F6_MENTOR_TOOLS} from './f6-output-channels';

const source = '李青\n\n教育经历\n江南大学｜信息管理本科｜2019—2023\n\n工作经历\n甲公司｜产品经理\n分析咨询后确定只读范围。';
const body = '李青\n\n甲公司｜产品经理\n分析咨询后确定只读范围。';
const hints = () => f6ReviewHints(source, body, [{id: 'source', text: source}]);

test('standalone qualification omitted inside a larger rewrite is explicit source data, not a verdict', () => {
  const evidence = hints();
  expect(evidence.sourceOnlyStandaloneLines).toContainEqual({line: 4, text: '江南大学｜信息管理本科｜2019—2023'});
  expect(evidence.sourceOnlyStandaloneLines).not.toContainEqual({line: 7, text: '甲公司｜产品经理'});
  expect(evidence.policy).toBe('mechanical_hints_not_verdict');
  expect(f6ReviewHints(source, source, []).sourceOnlyStandaloneLines).toEqual([]);
});

test('equivalent wording is still a lexical pointer, not an automatic rejection or fabricated finding', () => {
  const changed = source.replace('信息管理本科', '信息管理（学士）');
  const data = f6ReviewHints(source, changed, []);
  expect(data.sourceOnlyStandaloneLines).toContainEqual({line: 4, text: '江南大学｜信息管理本科｜2019—2023'});
  expect(data).not.toHaveProperty('verdict');
  expect(data).not.toHaveProperty('passed');
});

test('same versioned coverage reaches HR target boundary and original author without parsing commentary', async () => {
  const call = jest.fn().mockResolvedValue('原稿学历未在新稿出现，请核对取舍。');
  const session = new F6HrReviewSession({resume: source, jd: '产品经理', facts: '[]'}, call, hints);
  expect(await session.inspect(body, 1)).toContain('学历');
  const messages = call.mock.calls[0][0];
  expect(messages.at(-1).content.endsWith(body)).toBe(true);
  const pointers = JSON.parse(messages[1].content).mechanical_review_hints.hints;
  expect(pointers.sourceOnlyStandaloneLines).toEqual(hints().sourceOnlyStandaloneLines);
  expect(session.reviewContext()?.hints).toEqual(f6ReviewReferences(source, body, hints()));
  expect(session.receipt().records[0].sourceComparison).toEqual(hints());
  expect(call).toHaveBeenCalledTimes(1);
  expect(await session.inspect(source, 0)).toBeNull();
  expect(session.receipt().finalState).toBe('author_revised_not_rechecked');
});

test('no synthetic coverage is added when legacy caller supplies no hints', () => {
  const messages = f6HrMessages({resume: source, jd: '', facts: '[]'}, body);
  expect(JSON.parse(messages[1].content)).not.toHaveProperty('mechanical_review_hints');
  expect(messages.at(-1)!.content.endsWith(body)).toBe(true);
});

test('compact references retain every literal comparison; lexical UI suspicions stay only in the receipt', () => {
  const full = hints();
  const wire = f6ReviewReferences(source, body, full);
  for (let index = 0; index < wire.passages.length; index++) {
    const part = wire.passages[index];
    expect(part.source.empty ? '' : source.slice(part.source.start!, part.source.end!)).toBe(full.passages[index].before);
    expect(part.candidate.empty ? '' : body.slice(part.candidate.start!, part.candidate.end!)).toBe(full.passages[index].after);
    expect(part).not.toHaveProperty('notices');
  }
  expect(wire.passages[0]).not.toHaveProperty('before');
  expect(wire.passages[0]).not.toHaveProperty('after');
  expect(wire).not.toHaveProperty('noticeEvidence');
});

const replayRoot = process.env.F6_COVERAGE_REPLAY;
(replayRoot ? test : test.skip)('actual v14 archived failure replays into explicit same-version coverage evidence', async () => {
  const root = replayRoot!;
  const fixture = JSON.parse(readFileSync(path.join(root, 'fixture.json'), 'utf8'));
  const task = JSON.parse(readFileSync(path.join(root, 'attempt-1-task-initial.json'), 'utf8')).task;
  const draft = task.result.f6Deliverables.files['resume-new.md'];
  const record = JSON.parse(readFileSync(path.join(root, 'attempt-1-coach_eval_runs-initial.json'), 'utf8'))
    .find((row: {id: string}) => row.id === task.delivery.evalRunId).run;
  const recordedHr = record.spans.find((span: {code: string}) => span.code === 'f6_hr_advisory').output.commentary;
  const call = jest.fn().mockResolvedValue(recordedHr);
  const session = new F6HrReviewSession({resume: fixture.resume, jd: fixture.jd, facts: '[]'}, call,
    body => f6ReviewHints(fixture.resume, body, [{id: 'original', text: fixture.resume}]));
  await session.inspect(draft, 1);
  const pointer = session.reviewContext()!.hints!.sourceOnlyStandaloneLines
    .find(line => line.text.includes('信息管理本科'));
  expect(pointer?.text).toContain('江南理工大学');
  expect(draft).not.toContain('信息管理本科');
  expect(call.mock.calls[0][0].at(-1).content.endsWith(draft)).toBe(true);
  expect(session.receipt().records[0].commentary).toBe(recordedHr);
  writeFileSync(path.join(root, 'attempt-1-coverage-replay.json'), JSON.stringify({
    kind: 'recorded_output_wiring_replay_not_model_quality', upstreamCalls: 0, costCny: 0,
    sourceEval: task.delivery.evalRunId, sourceTrace: task.delivery.traceId,
    sameVersionedContext: session.reviewContext(), target: call.mock.calls[0][0].at(-1).content,
    badDraftPreserved: true, badHrPreserved: true, semanticQualityRetested: false,
  }, null, 2));
});

(replayRoot ? test : test.skip)('actual v15 review confusion replays with raw readable target and no altered source or output', async () => {
  const root = replayRoot!;
  const fixture = JSON.parse(readFileSync(path.join(root, 'fixture.json'), 'utf8'));
  const task = JSON.parse(readFileSync(path.join(root, 'attempt-2-task-initial.json'), 'utf8')).task;
  const record = JSON.parse(readFileSync(path.join(root, 'attempt-2-coach_eval_runs-initial.json'), 'utf8'))
    .find((row: {id: string}) => row.id === task.delivery.evalRunId).run;
  const hr = record.spans.find((span: {kind: string; name: string}) => span.kind === 'agent' && span.name === '独立质检 Agent');
  const oldTarget = JSON.parse(hr.input.messages.at(-1).content);
  const messages = f6HrMessages({resume: fixture.resume, jd: fixture.jd, facts: '[]'}, oldTarget.text);
  expect(messages.at(-1)!.content.endsWith(oldTarget.text)).toBe(true);
  expect(messages.at(-1)!.content).toContain('从 0 到 1');
  expect(messages.at(-1)!.content).not.toContain('\\n');
  expect(messages.find(message=>message.content.startsWith('核源文档 resume.md'))!.content.endsWith(fixture.resume)).toBe(true);
  expect(JSON.parse(messages[1].content).sources['resume.md'].sha256)
    .toBe(createHash('sha256').update(fixture.resume).digest('hex'));
  writeFileSync(path.join(root, 'attempt-2-readable-target-replay.json'), JSON.stringify({
    kind: 'recorded_input_representation_replay_not_model_quality', sourceEval: task.delivery.evalRunId,
    newModelCalls: 0, costCny: 0, candidateBytePreserved: true, originalSourcePreserved: true,
    archivedHrStillUnchanged: hr.output, rawReadableTarget: messages.at(-1)!.content,
    semanticQualityRetested: false,
  }, null, 2));
});

(replayRoot ? test : test.skip)('freeze the two actual v16 generation calls for an explicit review-and-author continuation test', () => {
  const root = replayRoot!;
  const task = JSON.parse(readFileSync(path.join(root, 'attempt-3-task-initial.json'), 'utf8')).task;
  const row = JSON.parse(readFileSync(path.join(root, 'attempt-3-coach_eval_runs-initial.json'), 'utf8'))
    .find((item: {id: string}) => item.id === task.delivery.evalRunId);
  const expanded = expandEvalTranscript(row.run) as {spans: Array<{
    id: string; kind: string; name: string; input: {messages: Parameters<typeof buildChatCompletionRequest>[0];
      options: Parameters<typeof buildChatCompletionRequest>[3]}; output: string;
  }>};
  const agents = expanded.spans.filter(span => span.kind === 'agent' && span.name === '改稿 Agent').slice(0, 2);
  const ledger = JSON.parse(readFileSync(path.join(root, 'budget-readback.json'), 'utf8'));
  const calls = new Map();
  for (const span of agents) for (const call of JSON.parse(span.output).tool_calls || []) calls.set(call.id, call);
  const entries = agents.map((span, index) => {
    const restored = span.input.messages.map(message => message.role === 'tool'
      ? {role: message.role, tool_call_id: message.tool_call_id, content: message.content}
      : ({role: message.role, content: message.content,
      ...(message.tool_calls ? {tool_calls: message.tool_calls.map(call => calls.get(call.id) || call)} : {}),
      }));
    // JSONB reorders nested object keys; tool schemas come from the unchanged
    // tracked catalogue, and original native calls from their stored strings.
    const request = buildChatCompletionRequest(restored, 'stepfun', 'step-3.7-flash',
      {...span.input.options, resumeF6Tools: true, nativeTools: F6_MENTOR_TOOLS});
    const requestSha256 = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    expect(requestSha256).toBe(ledger.calls[8 + index].requestHash);
    const payload = JSON.parse(span.input.messages[1].content);
    for (const fact of payload['facts.md']) expect(span.output).not.toContain(fact.id);
    return {sourceSpan: span.id, originalRequestSha256: requestSha256, request,
      output: JSON.parse(span.output), originalUsage: ledger.calls[8 + index].usage};
  });
  writeFileSync(path.join(root, 'qa-recorded-prefix.json'), JSON.stringify({
    sourceEval: task.delivery.evalRunId, sourceTrace: task.delivery.traceId,
    disclosure: 'First two actual generation results replayed explicitly; only HR and original-author response are fresh. Not a new full generation.',
    allowedDifference: 'Per-opportunity fact UUID remap and fact row order only; exact texts/set and all other request fields must match.',
    entries,
  }, null, 2), {mode: 0o600});
});
