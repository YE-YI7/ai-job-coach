import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runF6ResumeWriter} from './resume-f6-writer';
import {F6HrReviewSession} from './f6-hr-review';
import {F6ToolSession} from './f6-tool-session';
import {currentF6MentorGuidance} from './f6-mentor-guidance';
import {resumeKnowledgeDelivery} from './resume-knowledge-delivery';

test('prepared F6 methods are not reported as delivered; legacy injection remains unchanged', () => {
  const prepared = [{id: 'method', title: '事实与补问'}, {id: 'case', title: '案例'}];
  expect(resumeKnowledgeDelivery(true, prepared, ['method'])).toEqual({
    preparedIds: ['method', 'case'], includedIds: [], includedMethodIds: [],
    stageCode: 'reviewed_methods_prepared_not_sent', delivered: false,
  });
  expect(resumeKnowledgeDelivery(false, prepared, ['method'])).toEqual({
    preparedIds: ['method', 'case'], includedIds: ['method', 'case'], includedMethodIds: ['method'],
    stageCode: 'reviewed_methods_in_context', delivered: true,
  });
});

test('execution receipts distinguish saved, rendered, and stale PDF without requiring a tool order', async () => {
  const services = {search: jest.fn(), fetch: jest.fn(), render: jest.fn().mockResolvedValue({
    bytes: new Uint8Array([1]), receipt: {pages: 1},
  })};
  const session = new F6ToolSession({resume: '原稿', jd: '', facts: []}, () => [], services);
  expect(session.deliveryState().pdf.status).toBe('not_rendered');
  await session.invoke('write_output', {files: [{name: 'resume-new.md', text: '新稿'}]});
  expect(session.deliveryState()).toMatchObject({resume: {saved: true, revision: 1}, pdf: {status: 'not_rendered'}});
  await session.invoke('render_pdf', {});
  expect(session.deliveryState().pdf).toMatchObject({status: 'current', revision: 1, pages: 1});
  await session.invoke('write_output', {files: [{name: 'resume-new.md', text: '新稿二'}]});
  expect(session.deliveryState().pdf.status).toBe('stale');
  expect(services.render).toHaveBeenCalledTimes(1);
});

// Real recorded outputs, never a fresh model call. The old HR mistakes remain
// visible: replay proves channel/state fixes, not new model semantic quality.
const traceFile = process.env.F6_DELIVERY_DIAGNOSIS_TRACE;
(traceFile ? test : test.skip)('replay the released failing trace without overwriting the user question', async () => {
  const before = readFileSync(traceFile!);
  const rows = JSON.parse(before.toString());
  const run = rows.find((row: {id: string}) => row.id === 'efa7d5f9-0177-43ea-a84c-5be1bb674081').run;
  const authors = run.spans.filter((span: {kind: string; name: string}) =>
    span.kind === 'agent' && span.name === '改稿 Agent');
  const originalHr = run.spans.find((span: {kind: string; name: string}) =>
    span.kind === 'agent' && span.name === '独立质检 Agent');
  const initial = run.spans.find((span: {code?: string}) =>
    span.code === 'f6_origin_runtime_contract').input.messages;
  const payload = JSON.parse(initial[1].content);
  const draftCall = JSON.parse(authors[3].output).tool_calls;
  const files = draftCall.flatMap((call: {function: {arguments: string}}) => JSON.parse(call.function.arguments).files);
  const question = files.find((file: {name: string}) => file.name === 'changes.md').text;
  const author = jest.fn();
  for (const span of authors) author.mockResolvedValueOnce(span.output);
  const hr = jest.fn().mockResolvedValue(originalHr.output);
  const result = JSON.parse(await runF6ResumeWriter({
    resume: payload['resume.md'], jd: payload['jd.txt'], facts: payload['facts.md'],
    request: payload.editingRequest, answers: payload.answers, decisions: payload.priorDecisions,
    scope: 'whole', format: {}, mentorCoaching: true,
  }, author, jest.fn(), () => [], undefined, undefined,
  new F6HrReviewSession({resume: payload['resume.md'], jd: payload['jd.txt'],
    facts: JSON.stringify(payload['facts.md'])}, hr)));
  expect(author).toHaveBeenCalledTimes(5);
  expect(hr).toHaveBeenCalledTimes(1);
  expect(author.mock.calls[0][0]).toEqual(initial);
  expect(currentF6MentorGuidance(result.f6Deliverables)).toBe(question);
  expect(result.fullDocument).toBe(files.find((file: {name: string}) => file.name === 'resume-new.md').text);
  expect(result.hrReview.authorResponse.text).toBe(authors[4].output);
  expect(result.f6Deliverables.renderedRevision).toBe(-1);
  expect(result.f6Deliverables.pdf).toBeUndefined();
  const finalInput = author.mock.calls[4][0];
  expect(JSON.parse(finalInput.at(-1).content).executionState.deliverables.pdf.status).toBe('not_rendered');
  expect(createHash('sha256').update(readFileSync(traceFile!)).digest('hex'))
    .toBe(createHash('sha256').update(before).digest('hex'));
  if(process.env.F6_DELIVERY_DIAGNOSIS_OUTPUT){
    writeFileSync(process.env.F6_DELIVERY_DIAGNOSIS_OUTPUT,JSON.stringify({
      kind:'recorded_output_replay_not_fresh_model_quality',sourceEval:run.id,
      sourceSha256:createHash('sha256').update(before).digest('hex'),
      modelCalls:0,costCny:0,authorOutputsConsumed:author.mock.calls.length,
      hrOutputsConsumed:hr.mock.calls.length,initialInputByteEqual:true,
      preservedBody:result.fullDocument,preservedQuestion:question,
      hrMessages:hr.mock.calls[0][0],internalReviewResponse:result.f6Deliverables.internalReviewResponse,
      lastExecutionState:JSON.parse(finalInput.at(-1).content).executionState,
      originalHrMistakesStillPreserved:true,
      limits:['No new model result or semantic correction asserted.',
        'No real cloud/browser/PDF test; source trace unchanged.'],
    },null,2)+'\n');
  }
});
