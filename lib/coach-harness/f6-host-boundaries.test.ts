import {verifyResumeGrounding} from './citation-verifier';
import {f6DocumentPreflight} from './resume-f6-preflight';
import {validateArtifactDraft} from './consistency';
import {compileContextBundle} from './context';
import type {CareerClaim} from './types';

const sources=[{id:'product',text:'产品及 Agent 插件已上线。'},
  {id:'experiment',text:'共约19组实验，没有一组上线。'}];
test('product delivery and experiment deployment are different subjects',()=>{
  const good=verifyResumeGrounding({candidateText:'产品及 Agent 插件已上线。',sources});
  expect(good.verdicts.filter(v=>v.status==='rejected')).toEqual([]);
  const bad=verifyResumeGrounding({candidateText:'19组实验全部上线。',sources});
  expect(bad.verdicts.some(v=>v.status==='rejected'&&v.reason==='negation_or_hedge_dropped')).toBe(true);
});
test('permission to lead one task does not erase participation in another',()=>{
  const pool=[{id:'user',text:'参与用户调研。'},{id:'competitor',text:'主导竞品调研。'}];
  const check=(text:string)=>verifyResumeGrounding({candidateText:text,sources:pool});
  expect(check('主导竞品调研。').verdicts.filter(v=>v.status==='rejected')).toEqual([]);
  expect(check('主导用户调研。').stats.rejected).toBeGreaterThan(0);
});
test('nominal plans already shipped are not a planned launch; genuine plans remain hedged',()=>{
  const pool=[{id:'product',text:'并行岗位计划与材料版本管理已上线。'}];
  expect(verifyResumeGrounding({candidateText:'并行岗位计划与材料版本管理均已上线。',sources:pool})
    .verdicts.filter(v=>v.status==='rejected'&&v.reason==='negation_or_hedge_dropped')).toEqual([]);
  for(const source of ['产品计划上线。','产品已计划上线。','产品预计已经上线。']){
    const report=verifyResumeGrounding({candidateText:'产品已经上线。',sources:[{id:'source',text:source}]});
    expect(report.verdicts.some(v=>v.status==='rejected'&&v.reason==='negation_or_hedge_dropped')).toBe(true);
  }
});
test('moving a known project fact into its title does not erase its source',()=>{
  const source='### 工具项目\n发起者\n\n产品及 Agent 插件已上线。\n';
  const good='### 工具项目\n发起者 · 产品及 Agent 插件已上线\n\n整理项目材料。\n';
  const notes=[{id:'experiment',text:'共约19组实验，没有一组上线。'}];
  // Only the launch relocation is under test; keep the remaining paragraph.
  expect(f6DocumentPreflight(source,good.replace('整理项目材料。','产品及 Agent 插件已上线。'),{projectSources:notes})).toEqual([]);
  expect(f6DocumentPreflight(source,good.replace('整理项目材料。','19组实验全部上线。'),{projectSources:notes})).not.toEqual([]);
});
test('calendar notation is normalized without accepting a different month or a new metric',()=>{
  const text='2025 年 11 月份到至今。产品用户 50 人。提升 1.8 分。';
  const fact:CareerClaim={id:'note',entityType:'experience',entityKey:'project',claimType:'project_note',value:text,
    displayText:text,sourceExcerpt:text,sourceKind:'user_statement',verificationLevel:'user_confirmed',
    status:'confirmed',visibility:'recruiter_safe'};
  const bundle=compileContextBundle({task:'resume_workshop',userId:'fake-owner',claims:[fact]});
  const check=(content:string)=>validateArtifactDraft({artifactType:'target_resume',visibility:'recruiter_safe',
    sections:[{path:'body',content,claimIds:['note']}]},bundle);
  expect(check('2025.11 起，产品用户 50 人。').ok).toBe(true);
  expect(check('2025.12 起，产品用户 50 人。').ok).toBe(false);
  expect(check('2025.11 起，产品用户 500 人。').ok).toBe(false);
  expect(check('提升 1.9 分。').ok).toBe(false);
});
