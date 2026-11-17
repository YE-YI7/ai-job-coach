import type {LlmMessage, NativeTool} from '@/lib/llm-tools';
import {F6_CONTEXT_REVIEW_RESPONSE, f6AuthorContract} from './f6-author-contract';
import {F6ContextTools} from './f6-context-tools';
import {F6HrReviewSession} from './f6-hr-review';
import {f6ScreeningPrompt} from './f6-screening-review';
import {f6InitialMessages, runF6ResumeWriter, F6_MAX_AUTHOR_CALLS} from './resume-f6-writer';

const resume = '林舟（虚构测试）\n产品实习｜2026.01—2026.06\n整理工单分类与验收表，参加方案评测。';
const makeInput = () => ({
  resume, jd: '', facts: [], request: '', answers: [], decisions: [], scope: 'whole' as const,
  format: {}, mentorCoaching: true as const,
  contextTools: new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined,
    {complete: true, documents: []}),
});
const write = (body = resume, mentor?: string) => JSON.stringify({
  type: 'native_tool_calls', content: '', tool_calls: [{
    id: 'write', type: 'function', function: {name: 'write_output', arguments: JSON.stringify({
      purpose: '交付当前稿', resume_markdown: body, ...(mentor ? {mentor_markdown: mentor} : {}),
    })},
  }],
});
const labels = ['表达与选材', '证据缺口', '客观条件与现状', '岗位与级别差距', 'HR意见可能有误'];

afterEach(() => {jest.restoreAllMocks();});

test('directions are optional reasoning guidance, not required categories or an output schema', () => {
  for (const label of labels) expect(F6_CONTEXT_REVIEW_RESPONSE).toContain(label);
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('可交叉使用或采用其他合适办法');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('不是固定步骤，也不必逐类作答');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('由你决定改稿、保留、查询或补问');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('用write_output交回完整resume_markdown');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('不是内部HR答辩');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('本轮不再另开HR复审');
});

test('the author selects memorable value without requiring a complete interview answer or source terminology', () => {
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('先找出最值得招聘方继续了解的个人价值');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('过程只保留读懂价值所需的部分，不要求每条凑齐公式');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('从本人已有行为提炼能力');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('无需用户先说过这些术语');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('不必提前写完面试答案');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('观察和本人解释也可，不强求实验或数字');
  expect(F6_CONTEXT_REVIEW_RESPONSE).not.toContain('合理概括可以用，自己的推测留作待确认');
});

test('the same author helps recognize a valuable angle while new episode claims remain distinct from ability synthesis', () => {
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('在右侧先点出可能体现的价值');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('请用户辨认是否贴合或补充关键情节');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('能力提炼与新增本人曾作出的比较、排除、决定或验证分开');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('上传简历原文、用户聊天原话或本人补充');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('AI首稿、导师推导及HR认可不增加本人事实');
  expect(F6_CONTEXT_REVIEW_RESPONSE).toContain('未答不代认、不削弱已有贡献，其他改稿并行交付');
  expect(F6_CONTEXT_REVIEW_RESPONSE).not.toContain('回答生成');
  expect(F6_CONTEXT_REVIEW_RESPONSE).not.toContain('有效期字段');
});

test('new directions are absent from the initial author and recruiter systems', () => {
  const initial = f6InitialMessages(makeInput());
  expect(initial[0].content).toBe(f6AuthorContract('whole'));
  for (const label of labels) {
    expect(JSON.stringify(initial)).not.toContain(label + '：');
    expect(f6ScreeningPrompt()).not.toContain(label + '：');
  }
});

test('only the existing post-HR instruction carries the directions; no extra call or tool is inserted', async () => {
  const requests: LlmMessage[][] = [], hrRequests: LlmMessage[][] = [];
  const catalogues: unknown[] = [];
  const author = jest.fn(async (messages: LlmMessage[], _phase: string, _ids: string[], tools?: NativeTool[]) => {
    requests.push(structuredClone(messages)); catalogues.push(structuredClone(tools));
    return write();
  });
  const hr = new F6HrReviewSession({resume: resume + '\n仅作者可见原始资料', jd: '', facts: '',
    reviewMode: 'recruiting_screen'}, async messages => {
    hrRequests.push(structuredClone(messages)); return '可约面，已有评测证据可以组织得更清楚。';
  });
  const result = JSON.parse(await runF6ResumeWriter(makeInput(), author, jest.fn(),
    undefined, undefined, undefined, hr));
  expect(requests).toHaveLength(2);
  expect(hrRequests).toHaveLength(1);
  expect(hrRequests[0]).toHaveLength(3);
  expect(JSON.stringify(hrRequests)).not.toContain('仅作者可见原始资料');
  expect(requests[0].some(message => message.content.includes(F6_CONTEXT_REVIEW_RESPONSE))).toBe(false);
  const instructionMessages = requests[1].filter(message => {
    try { return JSON.parse(message.content).instruction === F6_CONTEXT_REVIEW_RESPONSE; }
    catch { return false; }
  });
  expect(instructionMessages).toHaveLength(1);
  expect(requests[1][0]).toEqual(requests[0][0]);
  expect(catalogues[1]).toEqual(catalogues[0]);
  expect(result.fullDocument).toBe(resume);
  expect(result.hrReview.finalState).toBe('author_retained_not_rechecked');
  expect(result.f6Deliverables.files['mentor.md']).toBeUndefined();
  expect(F6_MAX_AUTHOR_CALLS).toBe(12);
});

test('a chosen revision and question use the existing complete-body and mentor paths', async () => {
  const updated = resume + '\n将常见工单问题归类，供方案验收使用。';
  const author = jest.fn().mockResolvedValueOnce(write())
    .mockResolvedValueOnce(write(updated, '验收表里哪一类问题让你调整过方案？'));
  const hr = new F6HrReviewSession({resume, jd: '', facts: '', reviewMode: 'recruiting_screen'},
    async () => '建议把分类与验收之间的关系写清。');
  const result = JSON.parse(await runF6ResumeWriter(makeInput(), author, jest.fn(),
    undefined, undefined, undefined, hr));
  expect(author).toHaveBeenCalledTimes(2);
  expect(result.fullDocument).toBe(updated);
  expect(result.f6Deliverables.files['mentor.md']).toBe('验收表里哪一类问题让你调整过方案？');
  expect(result.hrReview.finalState).toBe('author_revised_not_rechecked');
  expect(hr.records).toHaveLength(1);
});

test('HR transport failure does not manufacture a critique or require author categorization', async () => {
  const author = jest.fn().mockResolvedValue(write());
  const hr = new F6HrReviewSession({resume, jd: '', facts: '', reviewMode: 'recruiting_screen'},
    async () => {throw Error('HR_UNAVAILABLE');});
  const result = JSON.parse(await runF6ResumeWriter(makeInput(), author, jest.fn(),
    undefined, undefined, undefined, hr));
  expect(author).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(resume);
  expect(result.hrReview.finalState).toBe('hr_failed_body_preserved');
});

test('replayed bad claims stay bad; wiring never silently corrects facts or certifies quality', async () => {
  const bad = resume + '\n认定所有问题都由知识过期造成，与其他因素无关。';
  const author = jest.fn().mockResolvedValueOnce(write()).mockResolvedValueOnce(write(bad));
  const hr = new F6HrReviewSession({resume, jd: '', facts: '', reviewMode: 'recruiting_screen'},
    async () => '可再突出诊断和判断能力。');
  const result = JSON.parse(await runF6ResumeWriter(makeInput(), author, jest.fn(),
    undefined, undefined, undefined, hr));
  expect(result.fullDocument).toBe(bad);
  expect(result.hrReview.finalState).toBe('author_revised_not_rechecked');
  expect(result.f6Deliverables.files['mentor.md']).toBeUndefined();
  // Stub responses test transport only, never whether a live model follows the guidance.
});
