import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {resumeEditingContext, isCurrentResumeUnchanged} from './resume-editing-context';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {F6HrReviewSession} from './f6-hr-review';
import type {ResumeAgentAnswer} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

const root = process.env.F6_CURRENT_DOCUMENT_REPLAY;
(root ? test : test.skip)('real failed v22 trace: replay all original outputs, correct inputs, and identify old content instead of inventing a new rewrite', async () => {
  const read = (name: string) => JSON.parse(readFileSync(path.join(root!, name), 'utf8'));
  const run = read('expanded-run.json');
  const snapshot = read('owned-run-snapshot.json');
  type Span = {kind: string; name: string; code?: string; input: {messages: Array<{content: string}>}; output: unknown};
  const agents: Span[] = run.spans.filter((span: Span) => span.kind === 'agent');
  const initial = JSON.parse(agents[0].input.messages[1].content);
  const source = {resume: initial['resume.md'], changes: initial.priorDecisions as ResumeChange[]};
  const answers = snapshot.tasks[0].answers as ResumeAgentAnswer[];
  const historySnapshot = JSON.stringify(answers);
  const editingContext = resumeEditingContext(source, {answers}, 'restart');
  const input = {resume: source.resume, jd: initial['jd.txt'], facts: initial['facts.md'], answers: initial.answers,
    decisions: initial.priorDecisions, request: editingContext.task.request, scope: 'whole' as const, format: {},
    editingContext, mentorCoaching: true as const};
  const newInput = JSON.parse(f6InitialMessages(input)[1].content);
  expect(newInput['resume.md']).toBe(initial.priorDecisions[0].after);
  expect(newInput.editingRequest).toBe('');
  expect(initial.editingRequest).not.toBe('');
  expect(newInput.source_reference_only.instructionHistory.some((item: {text: string}) =>
    item.text === initial.editingRequest)).toBe(true);
  const authors = agents.filter(span => span.name === '改稿 Agent');
  const hr = agents.find(span => span.name === '独立质检 Agent')!;
  const toolOutputs: Span[] = run.spans.filter((span: Span) => span.code?.startsWith('f6_tool_'));
  const resultFor = (code: string) => toolOutputs.filter(span => span.code === code);
  const searches = resultFor('f6_tool_search');
  const fetches = resultFor('f6_tool_fetch');
  const render = resultFor('f6_tool_render_pdf')[0];
  let authorIndex = 0, searchIndex = 0, fetchIndex = 0;
  const call = jest.fn(async () => authors[authorIndex++].output as string);
  const hrCall = jest.fn(async () => hr.output as string);
  const session = new F6HrReviewSession({resume: source.resume, currentResume: editingContext.current.text,
    jd: input.jd, facts: JSON.stringify(input.facts)}, hrCall);
  const delivered = JSON.parse(await runF6ResumeWriter(input, call, jest.fn(), undefined, {
    search: async () => searches[searchIndex++].output,
    fetch: async () => fetches[fetchIndex++].output,
    // This is a receipt replay, explicitly NOT a new PDF export or quality test.
    render: async () => ({bytes: new Uint8Array(), receipt: render.output as Record<string, unknown>}),
  }, undefined, session));
  expect(authorIndex).toBe(authors.length);
  expect(hrCall).toHaveBeenCalledTimes(1);
  expect(delivered.fullDocument).toBe(snapshot.tasks[0].result.f6Deliverables.files['resume-new.md']);
  expect(isCurrentResumeUnchanged(editingContext.current.text, delivered.fullDocument)).toBe(true);
  expect(JSON.stringify(answers)).toBe(historySnapshot);
  writeFileSync(path.join(root!, 'v23-current-document-replay.json'), JSON.stringify({
    kind: 'recorded_failure_transport_replay_not_fresh_model_quality', upstreamCalls: 0, costCny: 0,
    sourceEval: snapshot.rows[0].id, sourceTrace: snapshot.rows[0].legacy_trace_id,
    recordedAuthorOutputsReplayed: authorIndex, recordedHrOutputsReplayed: 1,
    currentVisibleDraftUsed: true, originalPreservedAsEvidence: true,
    oldInstructionsPreservedNotCommands: true, originalAnswersUnchanged: true,
    oldOutputCorrectlyClassifiedUnchanged: true, forcedToolOrder: false,
    freshGenerationTested: false, actualPdfExportTested: false, productionWrites: 0,
  }, null, 2), {mode: 0o600});
});
