import { analyzeResumeGap, MAX_TEXT_LENGTH } from './matcher';
import { buildGapChecklist, GAP_EXAMPLES, gapEventProperties, isGapExample, validateGapInput } from './workflow';

describe('public gap workflow', () => {
  it('requires both real materials before reporting', () => {
    expect(validateGapInput(' ', 'Java')).toContain('简历');
    expect(validateGapInput('Java', '\n')).toContain('JD');
    expect(validateGapInput('Java', 'Java')).toBeNull();
  });
  it('rejects overlong input without silently truncating the supplied source', () => {
    const source = 'x'.repeat(MAX_TEXT_LENGTH + 1);
    expect(validateGapInput(source, 'Java')).toContain('原文已保留');
    expect(source).toHaveLength(MAX_TEXT_LENGTH + 1);
    expect(validateGapInput('Java', source)).not.toBeNull();
    expect(validateGapInput('x'.repeat(MAX_TEXT_LENGTH), 'Java')).toBeNull();
  });
  it('separates unchanged examples from user-owned input', () => {
    for (const example of Object.values(GAP_EXAMPLES)) {
      expect(isGapExample(example.resumeText, example.jdText)).toBe(true);
      expect(isGapExample(example.resumeText + '真实经历', example.jdText)).toBe(false);
    }
  });
  it('exports actual current findings and labels sample evidence', () => {
    const report = analyzeResumeGap(GAP_EXAMPLES.engineering);
    const text = buildGapChecklist(report, true);
    expect(text).toContain('（示例）');
    report.missing.forEach((term) => expect(text).toContain(`[ ] ${term}`));
    report.hardRequirements.filter((h) => !h.satisfied).forEach((h) => expect(text).toContain(h.jdEvidence));
    expect(buildGapChecklist(report, false)).not.toContain('（示例）');
    expect(text).not.toContain('匹配度');
  });
  it('does not claim completeness for zero findings', () => {
    const report = analyzeResumeGap({ resumeText: 'Java', jdText: 'Java' });
    expect(buildGapChecklist(report, false)).toContain('仍需核对');
    expect(buildGapChecklist(report, false)).toContain('不代表简历已完整');
  });
  it('telemetry only includes counts and sample flag', () => {
    const props = gapEventProperties(analyzeResumeGap(GAP_EXAMPLES.product), false);
    expect(Object.keys(props).sort()).toEqual(['hardUnmet', 'missingCount', 'sample']);
    expect(JSON.stringify(props)).not.toContain('PRD');
  });
  it('does not turn unsupported vocabulary into a successful match', () => {
    const text = buildGapChecklist(analyzeResumeGap({ resumeText: '庭院花卉养护', jdText: '花卉养护师' }), false);
    expect(text).toContain('不能给出命中结论');
    expect(text).not.toContain('都有词面命中');
  });
});
