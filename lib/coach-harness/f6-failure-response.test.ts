import {f6FailureResponse} from './f6-failure-response';

test('author exhaustion explicitly reports no draft, not completed or a materials problem', () => {
  const response = f6FailureResponse(Error('F6_AUTHOR_CALL_BUDGET_EXHAUSTED'));
  expect(response).toMatchObject({ok: false, reasonCode: 'resume_author_no_draft', retryable: false});
  expect(response?.error).toContain('修改没有保存');
  expect(response?.error).not.toMatch(/修改完成|材料不足|未扣费/);
  expect(f6FailureResponse(Error('other'))).toBeNull();
});
