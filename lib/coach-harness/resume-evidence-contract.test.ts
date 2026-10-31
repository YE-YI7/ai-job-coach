import {checkEditorialEvidence, evidenceReviewPassed, RESUME_CONTRIBUTION_REVIEW_PROMPT} from './resume-evidence-contract';
test('引用真实连续片段才成立，不替模型制造证据或把引用当语义质量', () => {
  const plan = {decisions: [{evidence: [{sourceId: 'one', quote: '修复输入封包'}]}]};
  expect(checkEditorialEvidence(plan, '[one] 与开发协作修复输入封包；未负责训练。')).toEqual([]);
  expect(checkEditorialEvidence(plan, '[two] 修复输入封包')).toContain('PLAN_EVIDENCE_NOT_IN_INPUT');
  expect(checkEditorialEvidence(plan, '[one] 与开发协作')).toContain('PLAN_EVIDENCE_NOT_IN_INPUT');
  expect(checkEditorialEvidence({decisions: [{change: '保留本来已清楚的句子'}]}, '[one] 原文')).toEqual([]);
});
test('结构和格式passed不能冒充贡献通过；事实与整稿失败仍有否决权', () => {
  const pass = {status: 'passed', summary: '逐条检查有据', findings: [],
    valueChecks: [{index: 0, useful: true, kind: 'specificity', impact: 'content', reason: '写明具体判断与改动的依据'}],
    document: {status: 'passed', summary: '整稿一致', findings: []}, requestCoverage: {status: 'complete', summary: '已完成本轮具体改稿目标', unaddressed: []},
    contributionReview: {status: 'passed', summary: '已写清具体判断与改动', findings: []}};
  expect(evidenceReviewPassed(pass)).toBe(true);
  expect(evidenceReviewPassed({...pass, contributionReview: undefined})).toBe(false);
  expect(evidenceReviewPassed({...pass, contributionReview: {status: 'failed', summary: '只有工具名', findings: ['缺具体改动']}})).toBe(false);
  expect(evidenceReviewPassed({...pass, document: {status: 'failed'}})).toBe(false);
  expect(evidenceReviewPassed({...pass, valueChecks: []})).toBe(false);
  expect(evidenceReviewPassed({...pass, valueChecks: [{...pass.valueChecks[0], impact: 'correction'}]})).toBe(false);
  expect(evidenceReviewPassed({...pass, document: {...pass.document, findings: [
    {changeId: null, category: 'grounding', severity: 'error', message: '有无据成果'}]}})).toBe(false);
  expect(RESUME_CONTRIBUTION_REVIEW_PROMPT).toContain('近义变化本身不是造假');
});
