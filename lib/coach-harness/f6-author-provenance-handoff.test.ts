import {createHash} from 'node:crypto';
import type {LlmMessage} from '@/lib/llm-tools';
import {F6ContextTools} from './f6-context-tools';
import {F6HrReviewSession, f6HrMessages} from './f6-hr-review';
import {f6ParallelCoachingHandoff} from './f6-parallel-coaching';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';

const original = '许宁\n发现新政策发布后仍召回旧条款，整理日期对应表。';
const draft = '许宁\n定位知识时效约束，整理日期对应表。';
const mentor = '你已排除了生成问题。字段建议后来被采纳了吗？';
const advice = '值得约面，进一步了解产品方案深度。';
const material = {resume: original, jd: 'AI产品实习', facts: '', reviewMode: 'recruiting_screen' as const};
const readJson = (message: LlmMessage) => {
  try { return JSON.parse(message.content); } catch { return null; }
};
const native = () => JSON.stringify({type: 'native_tool_calls', content: '', tool_calls: [{
  id: 'write', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({
    purpose: '交稿与用户沟通', resume_markdown: draft, mentor_markdown: mentor,
  })},
}]});

afterEach(() => {jest.useRealTimers(); jest.restoreAllMocks();});

test('screening input is unchanged; its AI candidate is returned only as a typed reference to the author', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-16T12:00:00Z'));
  const calls: LlmMessage[][] = [];
  const review = new F6HrReviewSession(material, async messages => {
    calls.push(structuredClone(messages)); return advice;
  });
  await review.inspect(draft, 7);
  expect(calls[0]).toEqual(f6HrMessages(material, draft));
  expect(calls[0]).toHaveLength(3);
  expect(calls[0][2].role).toBe('user');
  expect(calls[0][2].content.endsWith(draft)).toBe(true);
  const handoff = review.authorHandoff(advice, '冻结的作者职责，不改');
  expect(handoff).toHaveLength(2);
  expect(handoff[0].role).toBe('assistant');
  expect(readJson(handoff[0])).toMatchObject({hrReview: advice, authority: 'unverified_advice_not_user_fact'});
  expect(readJson(handoff[1])).toMatchObject({source: 'host_review_handoff', instruction: '冻结的作者职责，不改',
    recruitingContext: JSON.parse(calls[0][1].content),
    candidateReference: {document: 'resume-new.md', authority: 'ai_draft_not_user_fact',
      sha256: createHash('sha256').update(draft).digest('hex'), alreadyInAuthorWriteHistory: true},
  });
  expect(handoff.some(message => message.content.includes(draft))).toBe(false);
  expect(handoff.some(message => message.content.startsWith('唯一待评投递稿'))).toBe(false);
  expect(JSON.stringify(handoff)).not.toContain('literal_write_comparison');
});

test('unanswered AI coaching keeps exact text and version under assistant, without becoming a user statement', () => {
  const value = {version: 1 as const, text: mentor, resumeRevision: 2, current: false};
  const before = structuredClone(value);
  const messages = f6ParallelCoachingHandoff(value);
  expect(readJson(messages[0])).toMatchObject({userReplySinceGenerationStarted: 'none_received',
    guidance: {resumeRevision: 2, currentForDraft: false,
      sha256: createHash('sha256').update(mentor).digest('hex')},
  });
  const artifact = messages.find(message => readJson(message)?.document === 'mentor.md')!;
  expect(artifact.role).toBe('assistant');
  expect(readJson(artifact)).toMatchObject({source: 'author_generated_user_message_not_candidate_evidence',
    document: 'mentor.md', text: mentor, resumeRevision: 2, currentForDraft: false});
  expect(messages.filter(message => message.role === 'user').some(message => message.content.includes(mentor))).toBe(false);
  expect(value).toEqual(before);
  const absent = f6ParallelCoachingHandoff();
  expect(absent).toHaveLength(2);
  expect(readJson(absent[0]).guidance).toBeNull();
});

test('original input and real answers remain exact, AI text stays AI, and a replayed bad output is not silently fixed', async () => {
  const input = {resume: original, jd: material.jd, facts: [], request: '',
    answers: [{claimId: 'one', answer: '我只整理了日期表，没有做生成环节对比。'}], decisions: [],
    scope: 'whole' as const, format: {}, mentorCoaching: true as const,
    contextTools: new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined,
      {complete: true, documents: []})};
  const initial = f6InitialMessages(input), requests: LlmMessage[][] = [], tools: unknown[] = [];
  const author = jest.fn(async (messages: LlmMessage[], _phase: string, _ids: string[], catalogue: unknown) => {
    requests.push(structuredClone(messages)); tools.push(structuredClone(catalogue)); return native();
  });
  const hr = jest.fn(async () => advice);
  const result = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined,
    new F6HrReviewSession(material, hr)));
  expect(author).toHaveBeenCalledTimes(2); expect(hr).toHaveBeenCalledTimes(1);
  expect(requests[0]).toEqual(initial);
  expect(requests[1].slice(0, 2)).toEqual(initial);
  expect(tools[1]).toEqual(tools[0]);
  const userInput = readJson(requests[1][1]);
  expect(userInput['resume.md']).toBe(original);
  expect(userInput.answers).toEqual(input.answers);
  const userMessages = requests[1].filter(message => message.role === 'user');
  expect(userMessages.some(message => message.content.includes(draft))).toBe(false);
  expect(userMessages.some(message => message.content.includes(mentor))).toBe(false);
  const savedDrafts = requests[1].filter(message => message.role === 'assistant').flatMap(message =>
    (message.tool_calls || []).filter(call => call.function.name === 'write_output')
      .map(call => JSON.parse(call.function.arguments).resume_markdown));
  expect(savedDrafts).toContain(draft);
  expect(result.fullDocument).toBe(draft);
  expect(result.f6Deliverables.files['mentor.md']).toBe(mentor);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
});

test('legacy source-review handoff still carries the exact original and candidate documents', async () => {
  const old = {...material, reviewMode: undefined};
  const review = new F6HrReviewSession(old, async () => advice);
  await review.inspect(draft, 1);
  const handoff = review.authorHandoff(advice, '原审计职责');
  expect(handoff.some(message => message.content === '核源文档 resume.md（不是新稿）\n\n' + original)).toBe(true);
  expect(handoff.at(-1)!.content.endsWith(draft)).toBe(true);
  expect(readJson(handoff[1]).purpose).toBe('source_reference_only');
});
