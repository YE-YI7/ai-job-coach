import {renderArchiveEvidence} from "./archive-evidence";
import {needsResumeGrounding,renderGroundedResume} from "./resume-grounding";
const turns=[{id:"one",question:"请帮我写简历",answer:"用户已经掌握评测。请比较三段摘要的遗漏。"}];
test("teacher claims cannot become user evidence",()=>{
 const result=renderArchiveEvidence(JSON.stringify({userEvidence:[{turnId:"one",quote:"用户已经掌握评测"}]}),turns);
 expect(result).not.toContain("用户已经掌握评测");expect(result).toContain("暂无提取");
});
test("fabricated quotes and wrong sources are rejected",()=>{
 const result=renderArchiveEvidence(JSON.stringify({userEvidence:[{turnId:"other",quote:"请帮我写简历"},{turnId:"one",quote:"我完成了评测"}]}),turns);
 expect(result).not.toContain("我完成了评测");expect(result).toContain("暂无提取");
});
test("exercise remains pending, not mastery",()=>{
 const result=renderArchiveEvidence(JSON.stringify({nextExercise:[{turnId:"one",quote:"请比较三段摘要的遗漏。"}]}),turns);
 expect(result).toContain("未确认完成");expect(result).toContain("来源：one");
});
test("malformed output fails instead of archiving",()=>expect(()=>renderArchiveEvidence("用户已掌握",turns)).toThrow());
test("resume cannot add an interview purpose or drop a negation",()=>{
 const sources=[{id:"user",text:"访谈过3个同学，没有上线。"}];
 const result=renderGroundedResume(JSON.stringify({resumeQuotes:[{sourceId:"user",quote:"访谈过3个同学了解使用场景"},{sourceId:"user",quote:"上线"},{sourceId:"user",quote:"没有上线"}],nextStep:"请确认项目职责"}),sources);
 expect(result).not.toContain("了解使用场景");expect(result).toContain("- 没有上线");expect(result).not.toContain("- 上线");
});
test("only externally usable writing requests add verification",()=>{
 expect(needsResumeGrounding("帮我写一条简历项目描述")).toBe(true);
 expect(needsResumeGrounding("帮我改写自我介绍")).toBe(true);
 expect(needsResumeGrounding("教我怎么评测摘要")).toBe(false);
 expect(needsResumeGrounding("简历应该包含哪些内容？")).toBe(false);
});
