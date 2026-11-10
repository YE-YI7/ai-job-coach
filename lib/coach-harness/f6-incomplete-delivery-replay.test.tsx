import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync, writeFileSync} from 'node:fs';
import {F6HrReviewSession} from './f6-hr-review';
import {f6ReviewHints} from './f6-review-hints';
import {runF6ResumeWriter, f6InitialMessages} from './resume-f6-writer';
import {expandEvalTranscript} from './eval-transcript-storage';
import ResumeMentorOutcome from '@/components/cockpit/ResumeMentorOutcome';
jest.mock('@/components/cockpit/TutorMarkdown', () => ({__esModule:true,
  default: ({children}:{children:string}) => <div>{children}</div>}));

const root = process.env.F6_COVERAGE_REPLAY;
(root ? test : test.skip)('actual v17 budget refusal survives writer-to-UI replay without pretending a new draft passed', async () => {
  const task = JSON.parse(readFileSync(root+'/attempt-4-task-initial.json', 'utf8')).task;
  const rows = JSON.parse(readFileSync(root+'/attempt-4-coach_eval_runs-initial.json', 'utf8'));
  const run = expandEvalTranscript(rows.find((row:{id:string}) => row.id === task.delivery.evalRunId).run) as {
    spans:Array<{code:string;kind:string;name:string;input:{messages:Array<{content:string}>};output:unknown}>};
  const initial = run.spans.find(span => span.code === 'f6_origin_runtime_contract')!.input.messages;
  const payload = JSON.parse(initial[1].content);
  const input = {resume:payload['resume.md'], jd:payload['jd.txt'], facts:payload['facts.md'],
    request:payload.editingRequest, answers:payload.answers, decisions:payload.priorDecisions,
    scope:'whole' as const, format:{}, mentorCoaching:true as const};
  expect(f6InitialMessages(input)).toEqual(initial);
  const author = jest.fn();
  run.spans.filter(span => span.kind === 'agent' && span.name === '改稿 Agent' && typeof span.output === 'string')
    .forEach(span => author.mockResolvedValueOnce(span.output));
  author.mockRejectedValueOnce(new Error('LLM API 调用失败: 429 QA_BUDGET_EXHAUSTED'));
  const commentary = run.spans.find(span => span.code === 'f6_hr_advisory')!.output as {commentary:string};
  const result = JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,undefined,undefined,
    new F6HrReviewSession({resume:input.resume,jd:input.jd,facts:JSON.stringify(input.facts)},
      async () => commentary.commentary, body => f6ReviewHints(input.resume,body,[{id:'source',text:input.resume}]))));
  expect(result.fullDocument).toBe(task.result.f6Deliverables.files['resume-new.md']);
  expect(result.f6Deliverables.reviewExecution.status).toBe('author_response_incomplete');
  const html = renderToStaticMarkup(<ResumeMentorOutcome result={{...task.result,
    f6Deliverables:result.f6Deliverables}} pendingCount={6}/>);
  expect(html).toContain('返修还没完成');expect(html).not.toContain('新稿已保存');
  writeFileSync(root+'/attempt-4-incomplete-ui-replay.json', JSON.stringify({
    kind:'actual_recorded_failure_writer_to_ui_replay',sourceEval:task.delivery.evalRunId,
    newModelCalls:0,costCny:0,badDraftBytePreserved:true,originalHrUnchanged:true,
    reviewExecution:result.f6Deliverables.reviewExecution,renderedHtml:html,
    semanticQualityAccepted:false,
  },null,2));
});
