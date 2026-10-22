import { checkResumeFormat, readDocumentReview, resumeStyleContract } from "./resume-document-review";
import type { ResumeChange } from "@/lib/opportunities/types";
const before="- **整理订单记录。** 每周将订单记录整理在Excel，交给同事核对。";
const change=(after:string):ResumeChange=>({id:"change-1",section:"实习",before,after,reason:"删重复",evidenceId:"source",status:"pending"});
test('duplicate list prefixes introduced by replacement fail deterministically; untouched old defects do not expand scope',()=>{
 expect(checkResumeFormat('• 原文','• • 新文',[],'preserve')).toEqual([expect.objectContaining({category:'format',severity:'error'})]);
 expect(checkResumeFormat('• • 旧缺陷','• • 旧缺陷',[],'preserve')).toEqual([]);
});
test("lost bold lead is caught, not repaired by blindly restoring old wording",()=>{
  expect(checkResumeFormat(before,"candidate",[change("- 每周整理Excel订单记录，交给同事核对。")],"preserve")[0]).toMatchObject({changeId:"change-1",category:"format"});
  expect(checkResumeFormat(before,"candidate",[change("- **订单记录整理。** 每周整理Excel订单记录，交给同事核对。")],"preserve")).toEqual([]);
});
test("no source lead-ins means no invented requirement; standardization is explicit",()=>{
  expect(checkResumeFormat("每周整理订单记录。","候选",[{...change("每周整理订单记录，交给同事。"),before:"每周整理订单记录。"}],"preserve")).toEqual([]);
  expect(checkResumeFormat(before,"候选",[change("- 整理Excel订单记录，交给同事。")],"standard")).toEqual([]);
  expect(resumeStyleContract(before,"preserve").boldLeadIns).toBe(1);
});
test("split bullets all preserve source hierarchy, not just the first item",()=>{
  expect(checkResumeFormat(before,"候选",[change("- **订单整理。** 整理Excel记录。\n- 交给同事核对。")],"repair")).toHaveLength(1);
});
test("missing, rewriting, unknown change or unexplained failed verdict never passes",()=>{
  const c=[change("- 整理订单记录。")];
  for(const raw of [null,{status:"passed",summary:"okay",findings:[],after:"rewrite"},{status:"failed",summary:"not okay",findings:[]},
    {status:"failed",summary:"bad",findings:[{changeId:"not-in-run",category:"quality",severity:"error",message:"bad"}]}])
    expect(readDocumentReview(raw,c,"independent").status).toBe("failed");
  expect(readDocumentReview({status:"passed",summary:"原格式与信息取舍一致",findings:[]},c,"self_review").source).toBe("self_review");
});
test('precise schema errors give the reviewer actionable contract repair without exposing material',()=>{
 const c=[change('- 整理订单记录。')];
 expect(readDocumentReview(undefined,c,'independent').contractError).toBe('document_missing');
 expect(readDocumentReview({status:'passed',summary:'okay',findings:[{changeId:'null',category:'missing_information',severity:'warning',message:'原稿待补'}]},c,'independent').contractError).toBe('document_finding_id_invalid');
 expect(readDocumentReview({status:'passed',summary:'okay',findings:[{changeId:null,category:'missing_information',severity:'warning',message:'原稿待补',question:'多余字段'}]},c,'independent').contractError).toBe('document_finding_fields_invalid');
 expect(readDocumentReview({status:'failed',summary:'缺信息',findings:[{changeId:null,category:'missing_information',severity:'warning',message:'原稿待补'}]},c,'independent').contractError).toBe('document_failed_without_error');
});
