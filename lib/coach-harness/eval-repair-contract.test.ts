import {isolatedEvalRepairId,readIsolatedEvalRepair} from './eval-repair-contract';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const model='deepseek-v4-flash';
const body={repairOf:id,requestId:isolatedEvalRepairId(id),resumeText:'虚构项目原文',jobDescription:'',
  editingRequest:'同一初始要求',comparison:{model,callLimit:2},repairFeedback:'候选把优化目标写成了无依据的已取得收益，需原编辑返修。'};
const parent={isolation:'no_opportunity_no_quota_no_old_answers',status:'completed',
  input:{resume:body.resumeText,jobDescription:'',editingRequest:body.editingRequest},
  comparison:{model,callLimit:4},spans:[{kind:'agent',model},{kind:'agent',model}],
  result:{output:'待返修的虚构候选',rawResponse:{ok:true}}};
test('same-input continuation shares the parent four-call ceiling and deterministic reservation',()=>{
  expect(readIsolatedEvalRepair(parent,body)).toMatchObject({maxCalls:2,parentCalls:2,previousCandidate:'待返修的虚构候选'});
  expect(isolatedEvalRepairId(id)).toBe(isolatedEvalRepairId(id));
});
test('changed source, model, instruction, another attempt, a child or spent parent never starts another workflow',()=>{
  for(const patch of [{resumeText:'换了原材料'},{editingRequest:'新要求'},{requestId:id},
    {comparison:{model:'another-model',callLimit:2}},{comparison:{model,callLimit:4}},{selfEvaluate:true}])
    expect(()=>readIsolatedEvalRepair(parent,{...body,...patch})).toThrow();
  for(const patch of [{repairOf:id},{status:'running'},{isolation:'workspace'},
    {spans:[...parent.spans,{kind:'agent',model}]}])
    expect(()=>readIsolatedEvalRepair({...parent,...patch},body)).toThrow();
});
