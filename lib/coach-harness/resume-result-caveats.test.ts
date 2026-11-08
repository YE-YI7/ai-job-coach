import {resumeResultCaveatIssues} from './resume-result-caveats';

const source='## 实习经历\n### 示例公司\n- 初步观察点击率提升。后续未稳定复现显著增量，继续核实。';
test('retaining a positive metric while dropping the result caveat is blocked',()=>{
  expect(resumeResultCaveatIssues(source,'## 实习经历\n### 示例公司\n- 观察到点击率提升，继续分析。')).toHaveLength(1);
});
test.each([
  '## 实习经历\n### 示例公司\n- 观察到点击率提升，但未能验证稳定结果。',
  '## 实习经历\n### 示例公司\n- 整理实验记录供复盘。',
  '## 项目经历\n### 另一公司\n- 核对日志。',
])('no demand to copy prose verbatim or retain an omitted result',candidate=>{
  expect(resumeResultCaveatIssues(source,candidate)).toEqual([]);
});
test('another experience cannot supply the missing caveat',()=>{
  const candidate='## 实习经历\n### 示例公司\n- 观察到点击率提升。\n### 另一公司\n- 尚未验证留存率提升。';
  expect(resumeResultCaveatIssues(source,candidate)).toHaveLength(1);
});
test('an initial positive signal cannot silently lose its later failed reproduction',()=>{
  const before='### 广告项目\n早期实验有小幅正向信号，后续未稳定复现显著增量，继续分析。';
  const after='### 广告项目\n早期实验出现小幅正向信号（点击率），继续分析。';
  expect(resumeResultCaveatIssues(before,after)).toHaveLength(1);
});
test('the scope is explicit outcome verification, not every negative statement',()=>{
  expect(resumeResultCaveatIssues('整理数据，未统计人数。','整理数据。')).toEqual([]);
});
