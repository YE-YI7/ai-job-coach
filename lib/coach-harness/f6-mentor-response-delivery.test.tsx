import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runF6ResumeWriter} from './resume-f6-writer';
import {F6HrReviewSession} from './f6-hr-review';
import {currentF6MentorGuidance} from './f6-mentor-guidance';
import {f6DocumentSafetyIssues} from './resume-f6-preflight';
import {withEvalObserver, type EvalSpan} from './eval-scope';
import ResumeMentorOutcome from '@/components/cockpit/ResumeMentorOutcome';

jest.mock('@/components/cockpit/TutorMarkdown', () => ({
  __esModule: true, default: ({children}: {children: string}) => <div>{children}</div>,
}));

const source = '林禾｜AI 产品经理\n邮箱：linhe@example.invalid\n负责规则验收，与算法协作交付。';
const body = source + '\n通过咨询分类，确定退款必须人工处理。';
const guidance = '这段取舍值得展开。你看过哪些小模型答错的具体案例？记不清就先保留已知事实。';
const input = {resume: source, jd: 'AI 客服产品经理', facts: [{id: 'own', text: source}],
  request: '', answers: [], decisions: [], scope: 'whole' as const, format: {}, mentorCoaching: true as const};
const tool = (name: string, args: unknown) => ({id: 'call-' + name, type: 'function',
  function: {name, arguments: JSON.stringify(args)}});
const reply = (...calls: ReturnType<typeof tool>[]) => JSON.stringify({type: 'native_tool_calls', tool_calls: calls});
const write = (files: Array<{name: string; text: string}>) => tool('write_output', {files});
const draft = () => reply(write([{name: 'resume-new.md', text: body}]));
const hr = () => new F6HrReviewSession({resume: source, jd: input.jd, facts: source},
  jest.fn().mockResolvedValue('可以核实小模型对比里的具体失败类型，不补造结果。'));

test.each(['mentor.md', 'changes.md', 'notes.md'])('post-HR %s can retain the verified body without rewriting it', async file => {
  const author = jest.fn().mockResolvedValueOnce(draft())
    .mockResolvedValueOnce(reply(write([{name: file, text: guidance}])));
  const verify = jest.fn((text: string) => f6DocumentSafetyIssues(source, text));
  const review = hr();
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), verify, undefined, undefined, review));
  expect(author).toHaveBeenCalledTimes(2);
  expect(verify.mock.calls.map(([text]) => text)).toEqual([body]);
  expect(result.fullDocument).toBe(body);
  expect(result.f6Deliverables.resumeRevision).toBe(1);
  expect(review.finalState).toBe('author_retained_not_rechecked');
  expect(review.records).toHaveLength(1);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(file === 'mentor.md' ? guidance : undefined);
});

test('a post-HR read is not mistaken for a completed response', async () => {
  const author = jest.fn().mockResolvedValueOnce(draft())
    .mockResolvedValueOnce(reply(tool('read_file', {file: 'facts.md'})))
    .mockResolvedValueOnce(reply(write([{name: 'mentor.md', text: guidance}])));
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined, hr()));
  expect(author).toHaveBeenCalledTimes(3);
  expect(result.fullDocument).toBe(body);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(guidance);
});

test('ordinary HR response is internal and cannot overwrite the existing user question', async () => {
  const internal = '我核对了原稿，保留正文，不补造线上结果。';
  const author = jest.fn().mockResolvedValueOnce(reply(write([
    {name: 'resume-new.md', text: body}, {name: 'mentor.md', text: guidance},
  ]))).mockResolvedValueOnce(internal);
  const verify = jest.fn((text: string) => f6DocumentSafetyIssues(source, text));
  const spans: EvalSpan[] = [];
  const result = JSON.parse(await withEvalObserver({spans, save: async () => {}}, () =>
    runF6ResumeWriter(input, author, jest.fn(), verify, undefined, undefined, hr())));
  expect(author).toHaveBeenCalledTimes(2);
  expect(verify.mock.calls.map(([text]) => text)).toEqual([body]);
  expect(result.fullDocument).toBe(body);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(guidance);
  expect(result.hrReview.authorResponse).toMatchObject({text: internal, audience: 'internal_review'});
  expect(result.f6Deliverables.internalReviewResponse).toMatchObject({
    text:internal,audience:'internal_review',resumeRevision:1,
  });
  expect(result.f6Deliverables.files['mentor.md']).toBe(guidance);
  expect(spans.some(span => span.code === 'host_capture_internal_hr_response')).toBe(true);
  expect(spans.some(span => span.code === 'host_capture_visible_body')).toBe(false);
  const messages=author.mock.calls[1][0];
  const receipt=JSON.parse(messages.find((m:{content:string})=>m.content.includes('"source":"host_review_handoff"')).content);
  expect(receipt.instruction).toContain('内部');
  expect(receipt.instruction).toContain('mentor.md');
  expect(receipt.instruction).toContain('resume-new.md');
  expect(receipt.instruction).not.toContain('交回完整稿');
  expect(JSON.parse(messages.at(-1).content).executionState.deliverables.pdf.status).toBe('not_rendered');
  const reread=JSON.parse(JSON.stringify(result));
  const html=renderToStaticMarkup(<ResumeMentorOutcome result={reread} pendingCount={1}/>);
  expect(html).toContain(guidance);
  expect(html).not.toContain(internal);
});

test('a rejected revised document cannot be masked by saving only a mentor reply', async () => {
  const wrong = '其他人｜姓名和联系方式已改\n无依据的经历';
  const corrected = body + '\n原职责边界不变。';
  const author = jest.fn().mockResolvedValueOnce(draft())
    .mockResolvedValueOnce(reply(write([{name: 'resume-new.md', text: wrong}]),
      write([{name: 'mentor.md', text: guidance}])))
    .mockResolvedValueOnce(reply(write([{name: 'resume-new.md', text: corrected},
      {name: 'mentor.md', text: guidance}])));
  const verify = jest.fn((text: string) => f6DocumentSafetyIssues(source, text));
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), verify, undefined, undefined, hr()));
  expect(author).toHaveBeenCalledTimes(3);
  expect(verify).toHaveBeenCalledWith(wrong);
  expect(result.fullDocument).toBe(corrected);
  expect(result.fullDocument).not.toContain('其他人');
  expect(result.f6Deliverables.resumeRevision).toBe(2);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(guidance);
});

test('a conversation after rejected document delivery preserves the valid draft and reports incomplete repair', async () => {
  const author = jest.fn().mockResolvedValueOnce(draft())
    .mockResolvedValueOnce(reply(write([{name: 'resume-new.md', text: '姓名已改'}])))
    .mockResolvedValueOnce(guidance);
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(),
    text => f6DocumentSafetyIssues(source, text), undefined, undefined, hr()));
  expect(author).toHaveBeenCalledTimes(3);
  expect(result.fullDocument).toBe(body);
  expect(result.hrReview.finalState).toBe('repair_incomplete:document_delivery_unresolved');
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBeUndefined();
  expect(result.hrReview.authorResponse.text).toBe(guidance);
});

test('post-HR conversation is visible in the existing outcome component and survives a JSON roundtrip', async () => {
  const author = jest.fn().mockResolvedValueOnce(draft())
    .mockResolvedValueOnce(reply(write([{name: 'mentor.md', text: guidance}])));
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined, hr()));
  const reread = JSON.parse(JSON.stringify({changes: result.changes, f6Deliverables: result.f6Deliverables,
    summary: '新稿与追问分别保存。'}));
  const html = renderToStaticMarkup(<ResumeMentorOutcome result={reread} pendingCount={1}/>);
  expect(html).toContain('aria-label="导师的补强建议"');
  expect(html).toContain(guidance);
  expect(html.indexOf(guidance)).toBeLessThan(html.indexOf('<details'));
  expect(reread.f6Deliverables.files['resume-new.md']).toBe(body);
});

// Optional private evidence replay; CI never needs access to a user's local files.
const privateTrace = process.env.F6_MENTOR_TRACE_PATH;
(privateTrace ? test : test.skip)('replay the actual captured natural-user outputs with zero network/model calls', async () => {
  const bytes = readFileSync(privateTrace!, 'utf8');
  const trace = JSON.parse(bytes);
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  const payload = JSON.parse(trace.initialAuthorMessages[1].content);
  const authorOutputs = trace.models.filter((item: {role: string}) => item.role === 'author')
    .map((item: {observedOutput: unknown}) => typeof item.observedOutput === 'string'
      ? item.observedOutput : JSON.stringify(item.observedOutput));
  const reviewOutput = trace.models.find((item: {role: string}) => item.role === 'independent_hr').observedOutput;
  const author = jest.fn();
  for (const output of authorOutputs) author.mockResolvedValueOnce(output);
  const reviewer = jest.fn().mockResolvedValue(reviewOutput);
  const sourceResume = payload['resume.md'];
  const verify = jest.fn((text: string) => f6DocumentSafetyIssues(sourceResume, text));
  const spans: EvalSpan[] = [];
  const result = JSON.parse(await withEvalObserver({spans, save: async () => {}}, () =>
    runF6ResumeWriter({resume: sourceResume, jd: payload['jd.txt'], facts: payload['facts.md'],
      request: payload.editingRequest, answers: payload.answers, decisions: payload.priorDecisions,
      scope: 'whole', format: {}, mentorCoaching: true}, author, jest.fn(), verify, undefined, undefined,
    new F6HrReviewSession({resume: sourceResume, jd: payload['jd.txt'], facts: JSON.stringify(payload['facts.md'])}, reviewer))));
  expect(JSON.parse(author.mock.calls[0][0][1].content)['resume.md']).toBe(sourceResume);
  expect(author).toHaveBeenCalledTimes(3);
  expect(reviewer).toHaveBeenCalledTimes(1);
  const firstDraft = trace.artifactSequence[0].files.find((file: {name: string}) => file.name === 'resume-new.md').text;
  const originalGuidance = trace.delivery.mentorGuidance.text;
  expect(result.fullDocument).toBe(firstDraft);
  expect(result.f6Deliverables.resumeRevision).toBe(1);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBeUndefined();
  expect(result.f6Deliverables.files['changes.md']).toBe(originalGuidance);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
  expect(verify).toHaveBeenCalledTimes(1);
  const html = renderToStaticMarkup(<ResumeMentorOutcome result={result} pendingCount={result.changes.length}/>);
  expect(html).not.toContain('有没有一两个典型反例');
  const output = {sourceTraceId: trace.experiment.traceId, sourceCaptureSha256: sourceHash,
    kind: 'offline_recorded_output_replay_not_a_new_model_run', modelCalls: 0, costCny: 0,
    authorOutputsConsumed: author.mock.calls.length, hrOutputsConsumed: reviewer.mock.calls.length,
    firstInputByteEqual: false, fullDocument: result.fullDocument, mentorGuidance: result.f6Deliverables.mentorGuidance,
    hrFinalState: result.hrReview.finalState, userVisible: html, spans,
    limitations: ['Recorded responses, not a fresh model behavior/quality acceptance.',
      'Original missing education and report-like writing are not repaired by this delivery fix.']};
  if (process.env.F6_MENTOR_REPLAY_OUTPUT) {
    writeFileSync(process.env.F6_MENTOR_REPLAY_OUTPUT, JSON.stringify(output, null, 2) + '\n');
  }
  expect(createHash('sha256').update(readFileSync(privateTrace!)).digest('hex')).toBe(sourceHash);
});
