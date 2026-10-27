import {resumeEditorialContract,rawProjectMessages,rawProjectDeliveryIssues} from './resume-editorial-contract';
import {resumeNumberTokens} from './resume-number-tokens';
import type {ResumeAgentAnswer} from './resume-task-types';
const instruction=(answer:string):ResumeAgentAnswer=>({id:'instruction',kind:'instruction',answer,question:'修改要求',sourceExcerpt:'',field:'action',savedAt:'2026-10-26'});
test('directions survive all stages but are not facts, and raw structure requires explicit authorization',()=>{
  const answers=[instruction('做项目总领和四个 bullet'),instruction('数字是用户给定的测试前提，不增加经历')];
  const contract=resumeEditorialContract('首先项目时间2025年11月到至今。',answers);
  expect(contract.rawProject).toBe(true);expect(contract.request).toContain(answers[0].answer);expect(contract.request).toContain(answers[1].answer);
  expect(contract.premise).toBe('user_supplied_scenario_not_verified');
  expect(resumeEditorialContract('工作经历\n某企业',answers).rawProject).toBe(false);
  expect(resumeEditorialContract('原材料',answers,false).rawProject).toBe(false);
  const input={source:'原材料',facts:'[a] 已有事实',knowledge:'写法资料',contract,feedback:['质检失败仍须返修']};
  const messages=rawProjectMessages(input);
  const actual=messages.find(m=>m.role==='user')!.content;
  expect(JSON.parse(actual).contract.request).toBe(contract.request);
  expect(actual).toContain('质检失败仍须返修');
});
test('date and list formatting do not invent quantities; units and date precision never collapse',()=>{
  expect(resumeNumberTokens('2025 年 11 月份')).toEqual(resumeNumberTokens('2025.11'));
  expect(resumeNumberTokens('2025 年 11 月 12 日')).toEqual(resumeNumberTokens('2025.11.12'));
  expect(resumeNumberTokens('1. 提升20 PP\n2. 达到30%')).toEqual(new Set(['20PP','30%']));
  expect(resumeNumberTokens('覆盖2人')).toEqual(new Set(['2人']));
  expect(resumeNumberTokens('30%')).not.toEqual(resumeNumberTokens('30PP'));
  expect(resumeNumberTokens('2025.11.12')).not.toEqual(resumeNumberTokens('2025.11'));
  expect(resumeNumberTokens('2026.11')).not.toEqual(resumeNumberTokens('2025.11'));
  expect(resumeNumberTokens('deepseek-v4-flash')).toEqual(new Set());
});
test('content delivery requires structure, visible decisions and retention, not a pass tag',()=>{
  const source='2025年11月份，提升20 PP，达到30%，增加10分钟';
  const after='2025.11\n总领\n- 定位\n- Harness：提升20 PP，达到30%\n- 成本\n- Eval：增加10分钟';
  const plan={mainline:'根据真实痛点提供导师化辅导',decisions:['定位','Harness','成本','Eval'].map(topic=>({topic,retain:'保留已有贡献',change:'围绕实际交付组织'}))};
  expect(rawProjectDeliveryIssues(source,after,plan)).toEqual([]);
  expect(rawProjectDeliveryIssues(source,after.replace('10分钟',''),'passed')).toEqual(expect.arrayContaining([expect.stringContaining('10分钟'),expect.stringContaining('主线')]));
});
