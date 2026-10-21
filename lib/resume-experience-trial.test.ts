import {resumeTrialTargets,resolveResumeTrialScope,inResumeTrialScope} from './resume-experience-trial';
const one='2025.01-2025.03 甲公司 运营实习\n负责核对退货原因，把记录整理成分类表，交给店长每周查看。';
const two='2025.05-2025.08 乙公司 运营实习\n协助整理库存差异，按商品汇总缺货记录。';
const resume=`姓名：虚构同学\n教育经历\n某大学 本科\n实习经历\n${one}\n\n${two}\n技能\nExcel`;
test('only independently recognised experiences are eligible, not the whole résumé/education/skills',()=>{
 const targets=resumeTrialTargets(resume);expect(targets).toHaveLength(2);expect(targets.map(t=>t.excerpt)).toEqual([one,two]);
 expect(resolveResumeTrialScope(resume,'education-0')).toBeNull();expect(resumeTrialTargets('无章节的整份原文，包含很多教育和个人技能。')).toEqual([]);
});
test('unique source spans inside one selected experience only',()=>{
 const scope=resumeTrialTargets(resume)[0];expect(inResumeTrialScope(scope,'把记录整理成分类表',resume)).toBe(true);
 for(const before of [two,'某大学 本科','Excel',resume,''])expect(inResumeTrialScope(scope,before,resume)).toBe(false);
 expect(inResumeTrialScope(scope,'运营实习',resume)).toBe(false); // Duplicate cannot target another entry.
});
test('unbounded and ambiguous entries fail closed',()=>{
 expect(resumeTrialTargets('项目经历\n'+ '很长的原文'.repeat(500))).toEqual([]);
 expect(resumeTrialTargets(`工作经历\n${one}\n\n${one}`)).toEqual([]);
 expect(resumeTrialTargets('校园经历\n社团活动：负责记录讨论内容并整理活动流程和签到表。')).toEqual([]);
});
