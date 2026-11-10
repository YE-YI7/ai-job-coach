import {f6ReviewHints} from './f6-review-hints';
import {f6HrMessages, F6HrReviewSession} from './f6-hr-review';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

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
  const target = JSON.parse(messages.at(-1).content);
  expect(target.text).toBe(body);
  expect(target.source_comparison_pointers.sourceOnlyStandaloneLines).toEqual(hints().sourceOnlyStandaloneLines);
  expect(session.reviewContext()?.hints).toEqual(hints());
  expect(call).toHaveBeenCalledTimes(1);
  expect(await session.inspect(source, 0)).toBeNull();
  expect(session.receipt().finalState).toBe('author_revised_not_rechecked');
});

test('no synthetic coverage is added when legacy caller supplies no hints', () => {
  const target = JSON.parse(f6HrMessages({resume: source, jd: '', facts: '[]'}, body).at(-1)!.content);
  expect(target).not.toHaveProperty('source_comparison_pointers');
  expect(target.text).toBe(body);
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
  expect(JSON.parse(call.mock.calls[0][0].at(-1).content).text).toBe(draft);
  expect(session.receipt().records[0].commentary).toBe(recordedHr);
  writeFileSync(path.join(root, 'attempt-1-coverage-replay.json'), JSON.stringify({
    kind: 'recorded_output_wiring_replay_not_model_quality', upstreamCalls: 0, costCny: 0,
    sourceEval: task.delivery.evalRunId, sourceTrace: task.delivery.traceId,
    sameVersionedContext: session.reviewContext(), target: JSON.parse(call.mock.calls[0][0].at(-1).content),
    badDraftPreserved: true, badHrPreserved: true, semanticQualityRetested: false,
  }, null, 2));
});
