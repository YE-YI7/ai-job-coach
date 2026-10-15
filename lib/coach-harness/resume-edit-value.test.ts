import {normalizeResumeDeletion,normalizeResumeBulletBreaks,isPersonalDisclaimer,omitStandaloneDisclaimers,resumeEditValueIssues,readResumeValueChecks,usefulResumeIndexes} from './resume-edit-value';
describe('resume editing value, separate from factuality',()=>{
  test('deletion instructions never become résumé prose or erase real contributions',()=>{
    expect(normalizeResumeDeletion('- 没有负责后端开发。','- （删除该条）')).toBe('');
    expect(normalizeResumeDeletion('- 协助编写接口说明。','- （删除该条）')).toBe('- （删除该条）');
    expect(resumeEditValueIssues('- 协助编写接口说明。','- （删除该条）')).toHaveLength(1);
    expect(normalizeResumeDeletion('未负责开发，但整理了清单。','（删除该条）')).toBe('（删除该条）');
  });
  test('a dated importance statement is not a résumé achievement',()=>expect(resumeEditValueIssues('提出了提醒机制，协作信息持续变化，希望主动提醒。','2025年11月提出提醒机制的重要性。希望系统主动提醒。').length).toBeGreaterThan(0));
  test('a concrete proposal can be edited without claiming implementation',()=>expect(resumeEditValueIssues('协作信息持续变化，提出按需提醒的设想，希望主动跟进。','针对协作信息持续变化的问题，提出按需主动提醒的设想。')).toEqual([]));
  test.each([['Excel、Word。','办公软件：Excel、Word。'],['Excel、Word','技能：Word、Excel'],['主要职责：整理清单','工作内容：整理清单']])('rejects cosmetic-only edits %s',(before,after)=>expect(resumeEditValueIssues(before,after).length).toBeGreaterThan(0));
  test('keeps actual concise restructuring',()=>expect(resumeEditValueIssues('平时负责记录退款问题，然后把未处理的问题整理成清单交给主管','记录退款问题，整理未处理清单交给主管')).toEqual([]));
  test('category labels on the same skill list are also cosmetic',()=>expect(resumeEditValueIssues('React、TypeScript、Vitest、Git。','前端技术：React、TypeScript；测试工具：Vitest；版本控制：Git').length).toBeGreaterThan(0));
  test('semicolon-separated model bullets become real separate bullets without changing facts',()=>{expect(normalizeResumeBulletBreaks('- 课程项目（原型阶段），参与前端开发；- 对接测试接口')).toBe('- 课程项目（原型阶段），参与前端开发\n- 对接测试接口');expect(normalizeResumeBulletBreaks('React - TypeScript；项目仍为原型')).toBe('React - TypeScript；项目仍为原型');});
  test('preserves an existing single bullet marker without inventing structure',()=>{
    expect(normalizeResumeBulletBreaks('导出销售数据并核对金额', '- 每日导出当日销售数据，然后核对金额')).toBe('- 导出销售数据并核对金额');
    expect(normalizeResumeBulletBreaks('- 导出数据\n- 核对金额', '- 导出数据，然后核对金额')).toBe('- 导出数据\n- 核对金额');
    expect(normalizeResumeBulletBreaks('核对金额', '核对金额')).toBe('核对金额');
    expect(normalizeResumeBulletBreaks('', '- 删除项')).toBe('');
  });
  test('other people responsibility is an internal constraint, not a personal bullet',()=>expect(resumeEditValueIssues('编写组件测试。后端由其他同学开发。','- 编写组件测试\n- 后端由其他同学开发。').length).toBeGreaterThan(0));
  test('omits standalone personal disclaimer without changing positive evidence',()=>expect(omitStandaloneDisclaimers('- 整理需求清单，交给负责页面的同学讨论\n- 未负责开发与上线，也未统计人数。')).toBe('- 整理需求清单，交给负责页面的同学讨论'));
  test('mixed sentence is rejected, not blindly transformed',()=>{const text='未负责开发，但整理了需求清单。';expect(omitStandaloneDisclaimers(text)).toBe(text);expect(resumeEditValueIssues('整理了需求清单',text)).toHaveLength(1);});
  test.each(['整理未处理工单','维护尚未上线的原型','排查未登录用户的访问异常','上线后零故障'])('preserves domain negatives and project maturity: %s',text=>{expect(isPersonalDisclaimer(text)).toBe(false);expect(omitStandaloneDisclaimers(text)).toBe(text);});
  test('missing or duplicate quality verdict cannot pass',()=>{expect(usefulResumeIndexes(readResumeValueChecks(undefined,1)).size).toBe(0);const check={index:0,useful:true,kind:'concision',reason:'删除重复职责前缀，让交付动作清楚'};expect([...usefulResumeIndexes(readResumeValueChecks([check],1))]).toEqual([0]);expect(usefulResumeIndexes(readResumeValueChecks([check,check],1)).size).toBe(0);});
});
