import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {F6ToolSession} from './f6-tool-session';
import {F6ContextTools} from './f6-context-tools';
import {F6HrReviewSession, f6HrMessages} from './f6-hr-review';
import {F6_SCREENING_PROMPT} from './f6-screening-review';
import {runF6ResumeWriter} from './resume-f6-writer';
import {deliveryFromTask} from './resume-delivery';
import * as evalScope from './eval-scope';

const resume = '周宁\n求职方向：AI产品经理\n参加8次销售访谈，整理120条问题，和1名算法工程师、1名后端工程师协作。';
const input = {resume, jd: '', facts: [], answers: [], decisions: [], request: '', scope: 'whole' as const,
  format: {}, mentorCoaching: true as const};
const memory = () => ({search: jest.fn().mockResolvedValue({matches: []}),
  read: jest.fn().mockResolvedValue({documents: [], unavailableIds: []})});
const contexts = () => new F6ContextTools(memory());
const native = (args: unknown) => JSON.stringify({type: 'native_tool_calls', content: '', tool_calls: [{
  id: 'write', type: 'function', function: {name: 'write_output', arguments: JSON.stringify(args)},
}]});
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

test('advertised write requires the body, not three channel explanations', () => {
  const session = new F6ToolSession({...input, contextTools: contexts()}, () => [], undefined, undefined, undefined, true);
  const schema = session.availableTools().find(tool => tool.function.name === 'write_output')!.function.parameters;
  expect(schema.properties).not.toHaveProperty('files');
  expect(schema.properties).toMatchObject({resume_markdown: {type: 'string'}, notes_markdown: {type: 'string'}});
  expect(schema.required).toEqual(['purpose', 'resume_markdown']);
  expect(schema.properties).not.toHaveProperty('memory_decision');
});

test('flat fields save all literal bytes atomically, keep size/identity verification and do not parse strings', async () => {
  const verify = jest.fn().mockReturnValue([]);
  const session = new F6ToolSession({...input, contextTools: contexts()}, verify, undefined, undefined, undefined, true);
  const body = resume + '\n正文中的 {"name":"原话"} 保持原样。';
  expect(await session.invoke('write_output', {resume_markdown: body, notes_markdown: '选择依据', mentor_markdown: '请问一个事实？'}))
    .toMatchObject({saved: ['resume-new.md', 'notes.md', 'mentor.md']});
  expect(session.outputs.get('resume-new.md')).toBe(body);
  expect(verify).toHaveBeenCalledWith(body);
  expect(session.deliverables().mentorGuidance?.current).toBe(true);
  await expect(session.invoke('write_output', {resume_markdown: body, files: []})).rejects.toThrow('OUTPUT_PAYLOAD_AMBIGUOUS');
  await expect(session.invoke('write_output', {resume_markdown: {text: body}})).rejects.toThrow('OUTPUT_SCOPE_OR_SIZE_INVALID');
  await expect(session.invoke('write_output', {files: '[{"name":"resume-new.md","text":"坏格式"}]'}))
    .rejects.toThrow('OUTPUT_FILE_LIST_INVALID');
  verify.mockReturnValue(['身份保护']);
  expect(await session.invoke('write_output', {resume_markdown: '改错姓名', mentor_markdown: '不应保存'}))
    .toMatchObject({saved: [], applied: false});
  expect(session.outputs.get('resume-new.md')).toBe(body);
  expect(session.outputs.get('mentor.md')).toBe('请问一个事实？');
});

test('purpose remains observable and obsolete decision fields are not promoted into facts or Trace claims', async () => {
  const capture = jest.spyOn(evalScope, 'captureEvalStage');
  try {
    const run = jest.fn().mockResolvedValue(native({resume_markdown: resume, purpose: '交稿',
      memory_decision: '查过为空，未添加经历。', knowledge_decision: '没查，当前问题是责任边界而非写法。', web_decision: '没有公司要求可校准。'}));
    const result = JSON.parse(await runF6ResumeWriter({...input, contextTools: contexts()}, run, () => {}));
    expect(result.fullDocument).toBe(resume);
    expect(run).toHaveBeenCalledTimes(1);
    const stage = capture.mock.calls.find(args => args[1] === 'f6_tool_decision_summary')![2]!;
    expect(stage.output).toMatchObject({source: 'model_tool_argument', text: '交稿'});
    expect(stage.output).not.toHaveProperty('channelDecisions');
    expect(result.fullDocument).not.toContain('没查');
    const missing = JSON.parse(await runF6ResumeWriter({...input, contextTools: contexts()},
      async () => native({resume_markdown: resume}), () => {}));
    expect(missing.fullDocument).toBe(resume);
  } finally { capture.mockRestore(); }
});

test('recruiting HR sees candidate and target, not a source audit or AI coaching; empty JD still allows direction-level judgment', async () => {
  const material = {resume: '只在核源稿里', jd: '', reviewMode: 'recruiting_screen' as const, targetRole: 'AI产品经理',
    get facts(): string { throw Error('SOURCE_AUDIT_NOT_ALLOWED'); }};
  const messages = f6HrMessages(material, resume);
  expect(messages).toHaveLength(3);
  expect(messages[0].content).toBe(F6_SCREENING_PROMPT);
  expect(messages[0].content).toContain('判断是否值得进入面试');
  expect(messages[0].content).toContain('没有JD时');
  expect(messages[0].content).not.toContain('不写总体匹配度');
  expect(messages[1].content).toContain('AI产品经理');
  expect(messages.at(-1)!.content.endsWith(resume)).toBe(true);
  expect(JSON.stringify(messages)).not.toContain('只在核源稿里');
  const hints = jest.fn();
  const call = jest.fn().mockResolvedValue('倾向约面。工单诊断有区分度，追问知识助手中的本人判断。');
  const session = new F6HrReviewSession(material, call, hints);
  await session.inspect(resume, 5, {text: 'AI编造的辅导', current: true, resumeRevision: 1});
  expect(hints).not.toHaveBeenCalled();
  expect(JSON.stringify(call.mock.calls[0])).not.toContain('AI编造的辅导');
  expect(session.receipt().reviewMode).toBe('recruiting_screen');
  await session.inspect(resume, 4);
  expect(call).toHaveBeenCalledTimes(1);
});

test('saved first draft plus rejected repair is partial even when the caller passes hasUnresolved=false', async () => {
  const original = '周宁\n主导8次销售访谈。';
  const author = jest.fn().mockResolvedValueOnce(native({resume_markdown: original}))
    .mockResolvedValueOnce(native({resume_markdown: {text: '不应保存'}}))
    .mockRejectedValueOnce(Error('QA_BUDGET_EXHAUSTED'));
  const review = new F6HrReviewSession({resume, jd: '', facts: ''}, async () => '责任写清，不是只报次数。');
  const result = JSON.parse(await runF6ResumeWriter({...input, contextTools: contexts()}, author, () => {},
    undefined, undefined, undefined, review));
  expect(result.fullDocument).toBe(original);
  expect(result.f6Deliverables.reviewExecution.status).toBe('author_response_incomplete');
  expect(deliveryFromTask({state: 'ready', result: {...result, resumeGenerationId: 'generation:1'}}, {
    generationId: 'generation:1', persisted: true, newChangeCount: 1, hasUnresolved: false,
  })).toMatchObject({outcome: 'partial_delivered', persistence: 'confirmed', reasonCode: 'resume_repair_incomplete'});
  expect(deliveryFromTask({state: 'ready', result: {...result, resumeGenerationId: 'old:1'}}, {
    generationId: 'new:1', persisted: true, newChangeCount: 1,
  }).outcome).toBe('delivered');
});

test('recruiting time context comes from the real runtime clock, not a model-guessed current year', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-13T04:00:00.000Z'));
  try {
    const messages = f6HrMessages({resume, jd: '', facts: '', reviewMode: 'recruiting_screen'}, resume);
    expect(JSON.parse(messages[1].content).asOfDateUtc).toBe('2026-11-13');
    expect(messages[0].content).toContain('不用训练记忆猜当前年份');
    expect(messages.at(-1)!.content.endsWith(resume)).toBe(true);
  } finally { jest.useRealTimers(); }
});

const root = process.env.F6_WIRE_REPLAY;
(root ? test : test.skip)('actual failed Trace: old shape fails unchanged, flat replay saves the same recorded repair body without an extra model', async () => {
  const fixture = JSON.parse(readFileSync(root + '/replay-fixture.json', 'utf8'));
  const tools = contexts();
  const payload = fixture.initialPayload;
  const replayInput = {...input, resume: payload['resume.md'], jd: payload['jd.txt'], contextTools: tools};
  const source = fixture.beforeBody as string, repair = fixture.repairBody as string;
  const legacy = new F6ToolSession({...replayInput}, () => []);
  await expect(legacy.invoke('write_output', fixture.failedArguments)).rejects.toThrow('OUTPUT_FILE_LIST_INVALID');
  const run = jest.fn().mockResolvedValueOnce(native({resume_markdown: source, notes_markdown: fixture.beforeNotes}))
    .mockResolvedValueOnce(native({resume_markdown: repair, notes_markdown: fixture.repairNotes, mentor_markdown: fixture.mentor}));
  const hr = jest.fn().mockResolvedValue(fixture.hrCommentary);
  const result = JSON.parse(await runF6ResumeWriter(replayInput, run, () => {}, undefined, undefined, undefined,
    new F6HrReviewSession({resume: replayInput.resume, jd: '', facts: ''}, hr)));
  expect(result.fullDocument).toBe(repair);
  expect(result.fullDocument).not.toBe(source);
  expect(result.f6Deliverables.reviewExecution.status).toBe('author_responded');
  expect(result.f6Deliverables.files['resume-new.md']).toBe(repair);
  expect(hr).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(2);
  const receipt = deliveryFromTask({state: 'ready', result: {...result, resumeGenerationId: 'replay:1'}}, {
    persisted: true, generationId: 'replay:1', newChangeCount: 4,
  });
  expect(receipt.outcome).toBe('delivered');
  writeFileSync(root + '/zero-cost-replay.json', JSON.stringify({sourceEvalRunId: fixture.sourceEvalRunId,
    actualOriginalBadShapeRejected: true, sourceSha256: digest(source), recordedRepairSha256: digest(repair),
    replayedDraftSha256: digest(result.fullDocument), bodyBytePreserved: true, actualModelCalls: 0, costCny: 0,
    reviewExecution: result.f6Deliverables.reviewExecution, receipt,
    semanticQualityAccepted: false, hrOutputIsOldRecordedOutputNotNewScreeningJudgment: true,
  }, null, 2));
});
