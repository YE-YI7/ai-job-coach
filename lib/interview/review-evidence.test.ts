import {hasReviewMaterial, hasGroundedReview} from "./review-evidence";
test.each(["", "啊啊", "啊".repeat(100), "好的。".repeat(100)])("rejects empty or repetitive material %s", text => expect(hasReviewMaterial(text)).toBe(false));
const source = "面试官问如何验证检索质量。我回答先整理实际用户问题，逐条标注相关文档，再检查检索结果中的有效命中，最后分析失败样本。";
test("allows substantive notes",()=>expect(hasReviewMaterial(source)).toBe(true));
test("requires verbatim answer evidence",()=>{
 const report = {overall_grade:"B",overall_comment:"局部作答评价",questions:[{user_answer_summary:"标注样本",evidence_quote:"先整理实际用户问题，逐条标注相关文档"}]};
 expect(hasGroundedReview(report,source)).toBe(true);
 expect(hasGroundedReview(report,"啊啊")).toBe(false);
 expect(hasGroundedReview({...report,insufficient_evidence:true},source)).toBe(false);
 expect(hasGroundedReview({...report,questions:[]},source)).toBe(false);
});
