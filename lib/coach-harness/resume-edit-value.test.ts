import {isPersonalDisclaimer,omitStandaloneDisclaimers,resumeEditValueIssues,readResumeValueChecks,usefulResumeIndexes} from './resume-edit-value';
describe('resume editing value, separate from factuality',()=>{
  test.each([['Excel、Word。','办公软件：Excel、Word。'],['Excel、Word','技能：Word、Excel'],['主要职责：整理清单','工作内容：整理清单']])('rejects cosmetic-only edits %s',(before,after)=>expect(resumeEditValueIssues(before,after).length).toBeGreaterThan(0));
  test('keeps actual concise restructuring',()=>expect(resumeEditValueIssues('平时负责记录退款问题，然后把未处理的问题整理成清单交给主管','记录退款问题，整理未处理清单交给主管')).toEqual([]));
  test('category labels on the same skill list are also cosmetic',()=>expect(resumeEditValueIssues('React、TypeScript、Vitest、Git。','前端技术：React、TypeScript；测试工具：Vitest；版本控制：Git').length).toBeGreaterThan(0));
  test('omits standalone personal disclaimer without changing positive evidence',()=>expect(omitStandaloneDisclaimers('- 整理需求清单，交给负责页面的同学讨论\n- 未负责开发与上线，也未统计人数。')).toBe('- 整理需求清单，交给负责页面的同学讨论'));
  test('mixed sentence is rejected, not blindly transformed',()=>{const text='未负责开发，但整理了需求清单。';expect(omitStandaloneDisclaimers(text)).toBe(text);expect(resumeEditValueIssues('整理了需求清单',text)).toHaveLength(1);});
  test.each(['整理未处理工单','维护尚未上线的原型','排查未登录用户的访问异常','上线后零故障'])('preserves domain negatives and project maturity: %s',text=>{expect(isPersonalDisclaimer(text)).toBe(false);expect(omitStandaloneDisclaimers(text)).toBe(text);});
  test('missing or duplicate quality verdict cannot pass',()=>{expect(usefulResumeIndexes(readResumeValueChecks(undefined,1)).size).toBe(0);const check={index:0,useful:true,kind:'concision',reason:'删除重复职责前缀，让交付动作清楚'};expect([...usefulResumeIndexes(readResumeValueChecks([check],1))]).toEqual([0]);expect(usefulResumeIndexes(readResumeValueChecks([check,check],1)).size).toBe(0);});
});
