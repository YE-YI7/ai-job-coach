import { resumeCallTimeout, resumeOutputCanBeRepaired, resumeTransportCanKeepCheckpoint } from './resume-execution-policy';

test('repair cannot consume the final-review and save budget', () => {
  expect(resumeCallTimeout(230_000, 130_000, 'repair', 75_000)).toBe(33_000);
  expect(resumeCallTimeout(230_000, 10_000, 'draft', 75_000)).toBe(75_000);
  expect(resumeCallTimeout(230_000, 130_000, 'review', 55_000)).toBe(55_000);
  expect(() => resumeCallTimeout(230_000, 156_000, 'repair', 75_000)).toThrow('LLM_REQUEST_TIMEOUT');
});

test('empty and truncated finals share one output repair, not a paid timeout retry', () => {
  expect(resumeOutputCanBeRepaired(new Error('Empty response from LLM (finish_reason=length)'))).toBe(true);
  expect(resumeOutputCanBeRepaired(new Error('模型输出中断 Incomplete response from LLM'))).toBe(true);
  expect(resumeOutputCanBeRepaired(new Error('LLM_REQUEST_TIMEOUT'))).toBe(false);
  expect(resumeTransportCanKeepCheckpoint(new Error('LLM_REQUEST_TIMEOUT'))).toBe(true);
  expect(resumeTransportCanKeepCheckpoint(new Error('insufficient balance'))).toBe(false);
});
