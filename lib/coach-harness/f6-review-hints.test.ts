import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import fixture from './__fixtures__/f6-v11-hr-evidence-handoff.json';
import {f6ReviewHints} from './f6-review-hints';
import {F6HrReviewSession, f6HrMessages, f6HrResponseInstruction} from './f6-hr-review';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {f6DocumentSafetyIssues} from './resume-f6-preflight';
import {F6_MENTOR_HR_RESPONSE_CHANNELS, currentF6MentorGuidance} from './f6-mentor-guidance';
import type {LlmMessage} from '@/lib/llm-tools';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const input = {resume: fixture.resume, jd: fixture.jd, facts: fixture.facts,
  request: fixture.request, answers: fixture.answers, decisions: fixture.decisions,
  scope: 'whole' as const, format: {}, mentorCoaching: true as const};
const sources = [{id: 'original', text: input.resume}, ...input.facts];
const material = {resume: input.resume, jd: input.jd,
  facts: input.facts.map(fact => `[${fact.id}] ${fact.text}`).join('\n\n')};
const write = (files: Array<{name: string; text: string}>) => JSON.stringify({type: 'native_tool_calls',
  tool_calls: [{id: 'w', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({files})}}]});
const source = '李青\n与1名算法、2名后端协作交付；离线解决率下降不超过1个百分点。';
const candidate = '李青\n带1名算法、2名后端交付；离线解决率下降≤1%。';
const hintsFor = (body: string) => f6ReviewHints(source, body, [{id: 'original', text: source}]);
const smallInput = {...input, resume: source, facts: [], jd: 'AI产品经理'};
const smallMaterial = {resume: source, jd: smallInput.jd, facts: '[]'};
const lastPayload = (messages: LlmMessage[]) => [...messages].reverse().filter(message=>message.content.startsWith('{'))
  .map(message=>JSON.parse(message.content)).find(payload=>payload.source==='host_review_handoff');

test('real v11 trace proves notices were absent from HR, not merely ignored after delivery', () => {
  const oldMessages = f6HrMessages(material, fixture.originalBody);
  // The source-only/current-candidate split is preserved; this recorded HR
  // input had no mechanical hints. Do not relabel it as a successful review.
  expect(JSON.parse(oldMessages[1].content)).not.toHaveProperty('mechanical_review_hints');
  expect(oldMessages.at(-1)!.content.endsWith(fixture.originalBody)).toBe(true);
  expect(fixture.hrCommentary).toContain('≤1%');
  expect(fixture.hrCommentary).toContain('最优解');
});

test('same original notice checker supplies exact source/candidate pairs before HR', () => {
  const hints = f6ReviewHints(input.resume, fixture.originalBody, sources);
  expect(hints.policy).toBe('mechanical_hints_not_verdict');
  const passage = hints.passages.find(part => part.notices.some(notice => notice.quote === '1%'))!;
  expect(passage.before).toContain('有一名算法和两名后端一起做');
  expect(passage.after).toContain('带1名算法、2名后端');
  expect(input.resume).toContain('不超过 1 个百分点');
  for (const part of hints.passages) {
    expect(input.resume).toContain(part.before);
    for (const notice of part.notices) expect(part.after.slice(notice.start, notice.end)).toBe(notice.quote);
  }
  expect(f6DocumentSafetyIssues(input.resume, fixture.originalBody)).toEqual([]);
});

test('normal format differences and unchanged material are not mechanical errors or rejection gates', () => {
  const original = '李青\n整理1200条用例。';
  expect(f6ReviewHints(original, original, [{id: 'original', text: original}]).passages).toEqual([]);
  const hints = f6ReviewHints(original, '李青\n整理1,200条用例。', [{id: 'original', text: original}]);
  expect(hints.passages).toHaveLength(1);
  expect(hints.passages[0].notices).toEqual([]);
});

test('recorded bad outputs stay unchanged; literal evidence, not lexical suspicions, reaches HR and author', async () => {
  const initial = f6InitialMessages(input);
  expect(hash(JSON.stringify(initial))).not.toBe(fixture.initialMessagesSha256);
  expect(JSON.parse(initial[1].content)['resume.md']).toBe(fixture.resume);
  expect(JSON.parse(initial[1].content)['facts.md']).toEqual(fixture.facts);
  const author = jest.fn();
  fixture.authorOutputs.forEach(output => author.mockResolvedValueOnce(output));
  const review = jest.fn().mockResolvedValue(fixture.hrCommentary);
  const evidence = jest.fn((body: string) => f6ReviewHints(input.resume, body, sources));
  const session = new F6HrReviewSession(material, review, evidence);
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(),
    body => f6DocumentSafetyIssues(input.resume, body), undefined, undefined, session));

  expect(author).toHaveBeenCalledTimes(5);
  expect(review).toHaveBeenCalledTimes(1);
  expect(evidence).toHaveBeenCalledTimes(1);
  const hrInput = JSON.parse(review.mock.calls[0][0][1].content).mechanical_review_hints;
  const authorInput = lastPayload(author.mock.calls[4][0]).mechanical_review_hints;
  expect(authorInput).toEqual(hrInput);
  expect(author.mock.calls[4][0].some((m:LlmMessage)=>m.content==='核源文档 resume.md（不是新稿）\n\n'+input.resume)).toBe(true);
  expect(hrInput.candidateSha256).toBe(hash(fixture.originalBody));
  expect(hrInput.sourceSha256).toBe(hash(input.resume));
  expect(hrInput.hints.passages.every((part:object)=>!('notices' in part))).toBe(true);
  expect(result.hrReview.records[0].sourceComparison.passages.some((part:{notices:Array<{quote:string}>})=>
    part.notices.some(notice=>notice.quote==='1%'))).toBe(true);
  expect(review.mock.calls[0][0].at(-1).content.endsWith(fixture.originalBody)).toBe(true);
  expect(result.hrReview.records[0].reviewContext).toEqual(hrInput);

  // Feeding archived outputs is not a fresh semantic acceptance. Preserve
  // the actual failures; never auto-edit bad text or hide it behind replay.
  expect(result.fullDocument).toBe(fixture.originalBody);
  expect(result.fullDocument).toContain('下降≤1%');
  expect(result.fullDocument).toContain('带1名算法、2名后端');
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBeUndefined();
  expect(result.f6Deliverables.files['changes.md']).toBe(fixture.originalGuidance);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
  if (process.env.F6_HR_HANDOFF_REPLAY_OUTPUT) {
    writeFileSync(process.env.F6_HR_HANDOFF_REPLAY_OUTPUT, JSON.stringify({
      kind: 'recorded_output_wiring_replay_not_fresh_semantic_acceptance',
      sourceEvalId: fixture.evalId, sourceTraceId: fixture.traceId,
      modelCalls: 0, costCny: 0, authorOutputsConsumed: author.mock.calls.length,
      hrOutputsConsumed: review.mock.calls.length, initialMessagesSha256: hash(JSON.stringify(initial)),
      originalHrMessagesSha256: fixture.originalHrMessagesSha256,
      newHrMessages: review.mock.calls[0][0], newAuthorReviewInput: author.mock.calls[4][0],
      sameVersionedContextDelivered: true, hrContext: hrInput, authorContext: authorInput,
      originalBadBodyPreserved: result.fullDocument === fixture.originalBody,
      originalBadGuidancePreserved: result.f6Deliverables.files['changes.md'] === fixture.originalGuidance,
      legacyChangeReportNotShownAsMentor: currentF6MentorGuidance(result.f6Deliverables) === undefined,
      hrFinalState: result.hrReview.finalState,
      qualityVerdict: 'not_retested_recorded_bad_outputs_still_bad',
    }, null, 2) + '\n');
  }
});

test('same evidence reaches the author for an ordinary visible document, without forcing write_output', async () => {
  const review = jest.fn().mockResolvedValue('请核对责任和单位。');
  const author = jest.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce('已核对，保留待确认稿。');
  const result = JSON.parse(await runF6ResumeWriter(smallInput, author, jest.fn(), undefined,
    undefined, undefined, new F6HrReviewSession(smallMaterial, review, hintsFor)));
  const context = lastPayload(author.mock.calls[1][0]).mechanical_review_hints;
  expect(context).toEqual(JSON.parse(review.mock.calls[0][0][1].content).mechanical_review_hints);
  expect(author.mock.calls[1][0].some((m:LlmMessage)=>m.content.endsWith(candidate))).toBe(true);
  expect(result.fullDocument).toBe(candidate);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
  expect(result.f6Deliverables.internalReviewResponse.text).toContain('已核对');
});

test('hints do not require structured HR output, change facts, or add a second HR call', async () => {
  const review = jest.fn().mockResolvedValue('无格式点评：可以补写SQL案例，但需用户确认。');
  const author = jest.fn().mockResolvedValueOnce(write([{name: 'resume-new.md', text: candidate}]))
    .mockResolvedValueOnce('SQL没有来源，不能补写。');
  const result = JSON.parse(await runF6ResumeWriter(smallInput, author, jest.fn(), undefined,
    undefined, undefined, new F6HrReviewSession(smallMaterial, review, hintsFor)));
  expect(review).toHaveBeenCalledTimes(1);
  expect(author).toHaveBeenCalledTimes(2);
  expect(result.hrReview.records[0].commentary).toBe('无格式点评：可以补写SQL案例，但需用户确认。');
  expect(result.fullDocument).toBe(candidate);
  expect(JSON.parse(author.mock.calls[1][0][1].content)['facts.md']).toEqual([]);
});

test('an advisory lookup failure preserves the draft and makes missing hints explicit, not a false pass', async () => {
  const review = jest.fn().mockResolvedValue('资料已核对，但仍需用户确认责任。');
  const session = new F6HrReviewSession(smallMaterial, review, () => {throw Error('projection unavailable');});
  const author = jest.fn().mockResolvedValueOnce(write([{name: 'resume-new.md', text: candidate}]))
    .mockResolvedValueOnce('这份待确认稿保留。');
  const result = JSON.parse(await runF6ResumeWriter(smallInput, author, jest.fn(), undefined,
    undefined, undefined, session));
  expect(result.fullDocument).toBe(candidate);
  expect(session.reviewContext()).toMatchObject({hintsUnavailable: true, candidateSha256: hash(candidate)});
  expect(session.reviewContext()).not.toHaveProperty('hints');
  expect(review).toHaveBeenCalledTimes(1);
});

test('a failed HR response retains the matching evidence and body without model retry', async () => {
  const session = new F6HrReviewSession(smallMaterial, async () => {throw Error('timeout');}, hintsFor);
  const author = jest.fn().mockResolvedValue(write([{name: 'resume-new.md', text: candidate}]));
  const result = JSON.parse(await runF6ResumeWriter(smallInput, author, jest.fn(), undefined,
    undefined, undefined, session));
  expect(author).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(candidate);
  expect(session.receipt()).toMatchObject({finalState: 'hr_failed_body_preserved',
    records: [{reviewContext: {candidateSha256: hash(candidate)}}]});
});

test('original-author revision and optional coaching use separate channels, with no review loop', async () => {
  const guidance = '你当时怎样比较客服的风险与处理量？记不清的话可以保留已知事实。';
  const review = jest.fn().mockResolvedValue('责任和单位需要核对。');
  const author = jest.fn().mockResolvedValueOnce(write([{name: 'resume-new.md', text: candidate}]))
    .mockResolvedValueOnce(write([{name: 'resume-new.md', text: source}, {name: 'mentor.md', text: guidance},
      {name: 'notes.md', text: '责任与单位按原文修正，不补SQL经历。'}]));
  const result = JSON.parse(await runF6ResumeWriter(smallInput, author, jest.fn(), undefined,
    undefined, undefined, new F6HrReviewSession(smallMaterial, review, hintsFor)));
  expect(result.fullDocument).toBe(source);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(guidance);
  expect(result.f6Deliverables.files['notes.md']).toContain('不补SQL经历');
  expect(result.hrReview.finalState).toBe('author_revised_not_rechecked');
  expect(result.hrReview.records[0].reviewContext.candidateSha256).toBe(hash(candidate));
  expect(result.f6Deliverables.resumeRevision).toBe(2);
  expect(review).toHaveBeenCalledTimes(1);
  expect(author).toHaveBeenCalledTimes(2);
});

test('internal disagreement has an explicit internal destination, not ambiguous user-facing explanation', () => {
  const instruction = f6HrResponseInstruction(F6_MENTOR_HR_RESPONSE_CHANNELS);
  expect(instruction).not.toContain('若点评不适用可保留原稿并说明理由');
  expect(instruction).toContain('理由只放notes.md或普通内部回复');
  expect(instruction).toContain('mentor.md只用于直接和用户沟通');
  expect(instruction).toContain('不能只反驳HR就认定正文正确');
});
