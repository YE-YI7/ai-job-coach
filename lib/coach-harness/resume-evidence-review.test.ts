import {groundingEvidenceIssues, candidateEvidenceIndex} from './resume-evidence-review';
const facts = '[one] 原稿说明协助完成项目原型，没有上线。';
const candidate = '独立主导完成项目并上线。';
const review = {document: {findings: [{category: 'grounding', severity: 'error'}]}, groundingEvidence: [{
  findingIndex: 0, sourceId: 'one', originalQuote: '协助完成项目原型', candidateQuote: '独立主导完成项目',
  dimension: 'responsibility', addedClaim: '协助被改成独立主导，新增责任'}]};
test('有据的真实责任越界保留否决，不因减少误拦而删除错误', () => {
  expect(groundingEvidenceIssues(review, facts, candidate)).toEqual([]);
});
test('不存在的引用/非本候选/无原主张不可当作事实返修证据', () => {
  expect(groundingEvidenceIssues({...review, groundingEvidence: []}, facts, candidate)).not.toEqual([]);
  expect(groundingEvidenceIssues(review, '[other] 协助完成项目原型', candidate)).not.toEqual([]);
  expect(groundingEvidenceIssues(review, facts, '协助完成项目原型。')).not.toEqual([]);
});
test('正常稿只要空证据表，不逐句复述；没有证据不自动判passed', () => {
  expect(groundingEvidenceIssues({document: {findings: []}, groundingEvidence: []}, facts, candidate)).toEqual([]);
  expect(groundingEvidenceIssues({document: {findings: []}}, facts, candidate)).toContain('GROUNDING_EVIDENCE_MISSING');
});
test('新协议按编号回指完整原文/候选，不要求模型重复抄写；未知编号不能放行', () => {
  const proof = {...review, groundingEvidence: [{findingIndex: 0, sourceId: 'one', candidateSentenceId: 'candidate-line-1',
    dimension: 'responsibility', addedClaim: '协助被改成独立主导'}]};
  expect(candidateEvidenceIndex(candidate)).toEqual([{id: 'candidate-line-1', text: candidate}]);
  expect(groundingEvidenceIssues(proof, facts, candidate)).toEqual([]);
  expect(groundingEvidenceIssues(proof, facts, '')).not.toEqual([]);
});
