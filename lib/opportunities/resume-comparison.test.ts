import {resumeChangeComparison} from "./resume-comparison";
import type {ResumeChange} from "./types";
const change={id:"c",section:"项目",before:"访谈8人",after:"完成8次访谈",status:"pending",reason:"调整表达"} as ResumeChange;
test("comparison retains the whole block, not just the replacement anchor",()=>{
 const result=resumeChangeComparison("张三\n\n## 项目经历\n校园项目：访谈8人，整理3条需求。\n没有生产实验。",change);
 expect(result.canApply).toBe(true);expect(result.before).toContain("没有生产实验。");expect(result.after).toContain("校园项目：完成8次访谈，整理3条需求。");expect(result.after).toContain("没有生产实验。");
});
test("missing and ambiguous sources cannot be adopted",()=>{
 expect(resumeChangeComparison("无此原文",change).canApply).toBe(false);
 expect(resumeChangeComparison("访谈8人\n访谈8人",change).canApply).toBe(false);
});
