import {createHash} from 'node:crypto';
import {F6ContextTools} from './f6-context-tools';
import {F6HrReviewSession} from './f6-hr-review';
import {F6_SCREENING_PROMPT} from './f6-screening-review';
import {f6ParallelCoachingHandoff} from './f6-parallel-coaching';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import type {LlmMessage} from '@/lib/llm-tools';

const source = '候选人\n参与产品规划，并完成五个模块的PRD设计。实训成员，统筹选品；协助销售105件。';
const question = '这份PRD是独立完成，还是和同事一起写的？';
const body = '候选人\n完成五个模块的PRD设计；实训中统筹选品，协助销售105件。';
const contexts = () => new F6ContextTools({
  search: jest.fn().mockResolvedValue({matches: []}),
  read: jest.fn().mockResolvedValue({documents: [], unavailableIds: []}),
}, undefined, {complete: true, documents: []});
const input = () => ({resume: source, jd: '', facts: [], request: '', answers: [], decisions: [],
  scope: 'whole' as const, format: {}, mentorCoaching: true as const, contextTools: contexts()});
const native = (draft: string, mentor?: string) => JSON.stringify({type: 'native_tool_calls', content: '',
  tool_calls: [{id: 'save', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({
    purpose: '交当前可用稿，同时向本人补问', resume_markdown: draft,
    ...(mentor ? {mentor_markdown: mentor} : {}),
  })}}]});

test('first generation delivers body and mentor together without any user response', async () => {
  const call = jest.fn().mockResolvedValue(native(body, question));
  const result = JSON.parse(await runF6ResumeWriter(input(), call, () => {}));
  expect(call).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(body);
  expect(result.f6Deliverables.mentorGuidance).toMatchObject({text: question, current: true});
  expect(result.fullDocument).not.toContain('独立完成');
});

test('HR response explicitly receives unanswered guidance, not candidate confirmation; HR itself is unchanged', async () => {
  const seen: LlmMessage[][] = [];
  const author = jest.fn(async (messages: LlmMessage[]) => {
    seen.push(structuredClone(messages));
    return native(body, question);
  });
  const hrCall = jest.fn(async (_messages: LlmMessage[]) => '值得约面；希望说清本人独立贡献。');
  const hr = new F6HrReviewSession({resume: source, jd: '', facts: '', reviewMode: 'recruiting_screen'}, hrCall);
  const result = JSON.parse(await runF6ResumeWriter(input(), author, () => {}, undefined, undefined, undefined, hr));
  expect(author).toHaveBeenCalledTimes(2);
  expect(hrCall).toHaveBeenCalledTimes(1);
  expect(hrCall.mock.calls[0][0][0].content).toBe(F6_SCREENING_PROMPT);
  expect(JSON.stringify(hrCall.mock.calls[0][0])).not.toContain(question);
  const state = seen[1].find(m => m.content.startsWith('{"source":"host_parallel_coaching"'))!;
  expect(JSON.parse(state.content)).toMatchObject({userReplySinceGenerationStarted: 'none_received',
    initialUserMaterialsRemainAvailable: true, guidance: {
      source: 'author_generated_user_message_not_candidate_evidence', resumeRevision: 1, currentForDraft: true,
      sha256: createHash('sha256').update(question).digest('hex'),
    }});
  const coaching = seen[1].find(m => m.content.startsWith('改稿与补问并行'))!.content;
  expect(coaching).not.toContain(question);
  expect(coaching).toContain('不把未答当否认');
  const priorAiMessage = seen[1].find(m => {
    try { return JSON.parse(m.content).document === 'mentor.md'; } catch { return false; }
  })!;
  expect(priorAiMessage.role).toBe('assistant');
  expect(JSON.parse(priorAiMessage.content).text).toBe(question);
  expect(result.fullDocument).toBe(body);
  expect(result.f6Deliverables.mentorGuidance.text).toBe(question);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
});

test('no useful question is allowed: no manufactured gap, no new call or blocking requirement', async () => {
  const call = jest.fn().mockResolvedValue(native(body));
  const result = JSON.parse(await runF6ResumeWriter(input(), call, () => {}));
  expect(call).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(body);
  expect(result.f6Deliverables.mentorGuidance).toBeUndefined();
  expect(JSON.parse(f6ParallelCoachingHandoff()[0].content).guidance).toBeNull();
});

test('an initial real user answer remains separate and usable rather than being reset by the generation state', () => {
  const value = {...input(), answers: [{claimId: 'pr d', answer: '我独立完成了这五个模块的PRD。'}]};
  const payload = JSON.parse(f6InitialMessages(value)[1].content);
  expect(payload.answers).toEqual(value.answers);
  const context = f6ParallelCoachingHandoff({version: 1, text: question, resumeRevision: 1, current: false});
  expect(JSON.parse(context[0].content).guidance.currentForDraft).toBe(false);
  expect(context[1].content).toContain('首请求中的本人回答仍有效');
});

test('ordinary body response also uses the same nonblocking HR handoff', async () => {
  const author = jest.fn().mockResolvedValueOnce(body).mockResolvedValueOnce(native(body, question));
  const hr = new F6HrReviewSession({resume: source, jd: '', facts: '', reviewMode: 'recruiting_screen'},
    async () => '贡献明确，面试再问分工。');
  const result = JSON.parse(await runF6ResumeWriter(input(), author, () => {}, undefined, undefined, undefined, hr));
  expect(author.mock.calls[1][0].find((m: LlmMessage) => m.content.startsWith('改稿与补问并行'))!.content)
    .toContain('本轮尚未保存导师消息');
  expect(result.fullDocument).toBe(body);
  expect(result.f6Deliverables.mentorGuidance.text).toBe(question);
});
