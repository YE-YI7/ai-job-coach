import {F6HrReviewSession, f6HrMessages, F6_HR_PROMPT} from './f6-hr-review';
import {f6ReviewExecution} from './f6-review-execution';
import {f6InitialMessages} from './resume-f6-writer';

const material = {resume: '李青\n某大学｜本科。\n甲项目灰度，乙项目仅离线。', jd: '产品经理', facts: '[]'};

test('review calibration never becomes candidate facts or the main author instructions', () => {
  const messages = f6HrMessages(material, '李青\n两个项目均已上线。');
  expect(F6_HR_PROMPT).toContain('正文的准确限定不能抵消总领');
  expect(messages[0].content).toContain('不写总体匹配度');
  expect(messages[2].content).toBe('核源文档 resume.md（不是新稿）\n\n'+material.resume);
  expect(messages[3].content).toBe('核源文档 facts.md（不是新稿）\n\n[]');
  const author = f6InitialMessages({resume: material.resume, jd: material.jd, facts: [], answers: [],
    decisions: [], request: '', scope: 'whole', format: {}, mentorCoaching: true});
  expect(author[0].content).not.toContain('审核校准例');
  expect(author[1].content).not.toContain('返工率从23%');
});

test('budget/time/error interrupted author responses remain explicitly incomplete, not successful delivery', async () => {
  const session = new F6HrReviewSession(material, async () => '请核实总领范围。');
  await session.inspect('新稿', 1);
  session.interrupted('429 QA_BUDGET_EXHAUSTED');
  expect(f6ReviewExecution(session.receipt(), '新稿')).toMatchObject({
    status: 'author_response_incomplete', certification: false, finalState: 'repair_incomplete:429 QA_BUDGET_EXHAUSTED',
  });
});

test('no author room is incomplete even if HR wrote a favorable commentary', async () => {
  const session = new F6HrReviewSession(material, async () => '可以约面。');
  await session.inspect('新稿', 0);
  expect(f6ReviewExecution(session.receipt(), '新稿')?.status).toBe('author_response_incomplete');
});

test('a completed response is only execution completion, never a quality certificate', async () => {
  const session = new F6HrReviewSession(material, async () => '核实。');
  await session.inspect('新稿', 1);
  await session.inspect('修订稿', 0);
  expect(f6ReviewExecution(session.receipt(), '修订稿')).toMatchObject({
    status: 'author_responded', certification: false,
  });
  expect(f6ReviewExecution(undefined, '稿件')).toBeUndefined();
});
