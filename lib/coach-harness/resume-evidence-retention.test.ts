import { resumeEvidenceRetentionFindings } from './resume-evidence-retention';
import type { ResumeChange } from '@/lib/opportunities/types';

const change = (before: string, after: string): ResumeChange => ({
  id: 'c1', before, after, section: '项目经历', reason: '精简', status: 'pending', evidenceId: 's1',
});
test('named failure modes explaining an optimization cannot disappear as generic background', () => {
  const before = '评测迭代：通过样本归因，针对术语表述不规范、相似条目误判问题，优化术语映射与判定规则。';
  expect(resumeEvidenceRetentionFindings([change(before,
    '评测迭代：通过样本归因，优化术语映射与判定规则。')])[0].severity).toBe('error');
  expect(resumeEvidenceRetentionFindings([change(before,
    '评测迭代：针对术语表述不规范、相似条目误判问题，优化术语映射与判定规则。')])).toEqual([]);
});
test('does not prohibit ordinary background compression or unsupported semantic guesses', () => {
  expect(resumeEvidenceRetentionFindings([change(
    '产品设计：针对操作步骤较多的问题，参与页面设计并完成原型。',
    '产品设计：参与页面设计并完成原型。')])).toEqual([]);
  expect(resumeEvidenceRetentionFindings([change(
    '排查日志中的误判问题，整理记录交给同事。', '整理误判记录交给同事。')])).toEqual([]);
});

test('OCR duplicate correction keeps the diagnosis; removing it or negation is still blocked',()=>{
 const before='检索优化：针对专业问问答依据匹配不准的问题，调整检索方案。';
 expect(resumeEvidenceRetentionFindings([change(before,'检索优化：针对专业问答依据匹配不准的问题，调整检索方案。')])).toEqual([]);
 expect(resumeEvidenceRetentionFindings([change(before,'检索优化：调整检索方案。')])).toHaveLength(1);
 expect(resumeEvidenceRetentionFindings([change('规则优化：针对字段不不规范问题，调整规则。','规则优化：针对字段不规范问题，调整规则。')])).toHaveLength(1);
});
