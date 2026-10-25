import { retainedResumeEvalInput } from './resume-retained-eval';
const before='- **需求交付。** 平时收集反馈，收集后汇总为问题清单，每周交给同事讨论。';
const change={id:'c-1',before,after:'- **需求交付。** 汇总反馈形成问题清单，每周交给同事讨论。',
  section:'经历',reason:'删重复收集过程突出原有清单',status:'pending',evidenceIds:['s1']};
const plan={mainline:'以反馈清单交付证明实际需求整理能力',claims:[{point:'反馈清单用于每周讨论',sourceIds:['s1']}],
  priorities:[{id:'p1',before,goal:'删重复收集过程突出已有清单与用途'}]};
const parent={provenance:'real_model_deidentified_comparison',status:'blocked',input:{resume:before,jobDescription:''},spans:[
  {kind:'stage',code:'own_materials_compiled',output:{allowedClaimIds:['s1'],unverifiedClaimIds:[]}},
  {kind:'stage',code:'editorial_plan_grounded',output:plan},
  {kind:'stage',code:'proposals_checked',output:{changes:[change]}},
  {kind:'agent',input:{messages:[{role:'user',content:JSON.stringify({facts:'[s1] '+before})}]}},
]};
test('retained review reads only exact captured candidates without permitting new wording or unknown IDs',()=>{
  expect(retainedResumeEvalInput(parent,['c-1'])).toMatchObject({original:before,preview:change.after,changes:[change],plan});
  expect(retainedResumeEvalInput(parent,['c-1','c-1'])).toBeNull();
  expect(retainedResumeEvalInput(parent,['not-provided'])).toBeNull();
  expect(retainedResumeEvalInput({...parent,provenance:'production'},['c-1'])).toBeNull();
  expect(retainedResumeEvalInput({...parent,status:'completed'},['c-1'])).toBeNull();
  expect(retainedResumeEvalInput({...parent,spans:parent.spans.filter(s=>s.code!=='own_materials_compiled')},['c-1'])).toBeNull();
});
