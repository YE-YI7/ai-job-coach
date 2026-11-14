import {F6_SCREENING_VALUE_GOAL} from './f6-screening-value-goal';
import {F6_SCREENING_PROMPT, f6ScreeningMessages} from './f6-screening-review';
import {F6HrReviewSession} from './f6-hr-review';
import {F6ContextTools} from './f6-context-tools';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import type {LlmMessage} from '@/lib/llm-tools';

const resume = '候选人\n求职方向：产品实习\n完成五个模块的PRD；根据工单确定优先级，协助业务落地。';
const body = '候选人\n独立完成五个模块PRD，并根据工单确定优先级、推动业务落地。';
const input = () => ({resume, jd: '', facts: [], request: '', answers: [], decisions: [],
  scope: 'whole' as const, format: {}, mentorCoaching: true as const,
  contextTools: new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined, {complete: true, documents: []})});
const native = (draft: string) => JSON.stringify({type: 'native_tool_calls', content: '', tool_calls: [{
  id: 'save', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({
    purpose: '突出本人产品判断与交付', resume_markdown: draft,
    mentor_markdown: '哪次优先级判断改变了业务的处理方式？可以从一张具体工单回忆。',
  })},
}]});

test('actual author and HR contexts share one screening-value objective, not a replacement evaluator', async () => {
  const authorMessages: LlmMessage[][] = [], hrMessages: LlmMessage[][] = [];
  const author = jest.fn(async (messages: LlmMessage[]) => {
    authorMessages.push(structuredClone(messages));
    return native(body);
  });
  const hr = new F6HrReviewSession({resume, jd: '', facts: '', reviewMode: 'recruiting_screen'}, async messages => {
    hrMessages.push(structuredClone(messages));
    return '值得约面，优先级判断与交付有匹配价值；面试追问一次真实干预。';
  });
  const result = JSON.parse(await runF6ResumeWriter(input(), author, () => {}, undefined, undefined, undefined, hr));
  expect(authorMessages[0][0].content).toContain(F6_SCREENING_VALUE_GOAL);
  expect(hrMessages[0][0].content).toBe(F6_SCREENING_PROMPT);
  expect(hrMessages[0][0].content).toContain(F6_SCREENING_VALUE_GOAL);
  expect(hrMessages[0][0].content).toContain('面试时可以继续了解');
  expect(hrMessages[0][0].content).toContain('不必先证明能独立操盘');
  expect(result.fullDocument).toBe(body);
  expect(author).toHaveBeenCalledTimes(2);
  expect(hrMessages).toHaveLength(1);
  expect(result.f6Deliverables.mentorGuidance.current).toBe(true);
});

test('objective changes neither personal input nor required output schema and does not require user answers', () => {
  const value = input();
  const messages = f6InitialMessages(value), payload = JSON.parse(messages[1].content);
  expect(payload['resume.md']).toBe(resume);
  expect(payload.answers).toEqual([]);
  expect(payload.personalMaterials).toEqual([]);
  expect(messages[0].content).toContain('不等答案才开始改');
  expect(messages[0].content).toContain('不是让用户逐个确认动词');
  expect(messages[0].content).toContain('事实依据是当前原稿');
});

test('HR still only receives this candidate and hiring context, not source audit, memory or author notes', () => {
  const messages = f6ScreeningMessages(body, '', '产品实习');
  expect(messages).toHaveLength(3);
  expect(JSON.parse(messages[1].content)).toMatchObject({targetRole: '产品实习', jd: null});
  expect(messages[2].content.endsWith(body)).toBe(true);
  expect(JSON.stringify(messages)).not.toContain('facts.md');
  expect(JSON.stringify(messages)).not.toContain('notes.md');
});
