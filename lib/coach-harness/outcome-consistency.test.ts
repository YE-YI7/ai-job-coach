import {outcomeFromModel} from "./learning-outcome";
const evidence={sessionId:"",attempts:["11111111-1111-4111-8111-111111111111"],answerDraft:"我自己的回答",goal:"分清角色边界",criterionVersion:1,scenarioAudited:false};
test("正文说要改但完成标签无缺口时不生成假成果",()=>{
 expect(outcomeFromModel({observedStatus:"提示下完成",openIssue:null,nextStep:null},{...evidence,feedbackText:"成立的地方如下。\n\n**需要改的地方**：你还没有解释失败边界。"})).toMatchObject({ok:false,code:"inconsistent_feedback"});
});
test("标准已经覆盖，不用默认给用户新缺口或必做下一题",()=>{
 const result=outcomeFromModel({observedStatus:"提示下完成",openIssue:null,nextStep:null},{...evidence,feedbackText:"你说的边界正确，本题完成。可以结束或可选再练。"});
 expect(result.ok&&result.outcome).toMatchObject({openIssue:null,nextStep:null,observedStatus:"提示下完成"});
});
test("模型把自己的讲解说成用户解释过，不能作为完成标准依据",()=>{
 const result=outcomeFromModel({observedStatus:"提示下完成",openIssue:null,nextStep:null,criterionEvidence:[{part:"mechanism",quote:"我自己的回答"},{part:"boundary",quote:"没有可靠标注时不成立"}]},{...evidence,requiredCriterionParts:["mechanism","boundary"]});
 expect(result.ok&&result.outcome.observedStatus).toBe("未独立检验");
});
test("机制和边界逐字回到用户回答，才可记录提示下完成",()=>{
 const result=outcomeFromModel({observedStatus:"提示下完成",openIssue:null,nextStep:null,criterionEvidence:[{part:"mechanism",quote:"我自己的回答"},{part:"boundary",quote:"没有可靠标注时不成立"}]},{...evidence,answerDraft:"我自己的回答：没有可靠标注时不成立",requiredCriterionParts:["mechanism","boundary"]});
 expect(result.ok&&result.outcome.observedStatus).toBe("提示下完成");
});
