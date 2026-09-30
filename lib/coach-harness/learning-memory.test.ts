import {compactProfile,makeLearningQuery,LEARNING_SYSTEM} from "./learning-memory";
import {compileTutorPrompt} from "./materials";
import {estimateTokens} from "./context";
jest.mock("@/lib/db");
describe("learning memory",()=>{
 test("general coaching does not require JD, but public knowledge cannot impersonate an uploaded file",()=>{
  expect(LEARNING_SYSTEM).toContain("缺JD不是一律blocking");
  expect(LEARNING_SYSTEM).toContain("不得将公共面经说成用户上传的面经");
 });
 test("prioritized saved JD survives oversized optional history",()=>{
  const jd="已保存JD：Kimi Agent协作产品经理，负责多智能体协作产品。";
  const compiled=compileTutorPrompt({system:LEARNING_SYSTEM,question:"拆这个岗位",budgetTokens:2000,materials:[
   {kind:"compiled_context",text:jd},
   {kind:"recent_turns",text:"旧对话".repeat(20000)},
  ]});
  expect(compiled.mustKeepViolations).toEqual([]);
  expect(compiled.text).toContain(jd);
  expect(estimateTokens(compiled.text)).toBeLessThanOrEqual(2000);
 });
 test("extractive compaction retains evidence status and source without inventing experience",()=>{
  const text=compactProfile([{id:"a",display_text:"做过客服访谈",status:"unverified",source_id:"src-a"},{id:"b",display_text:"已撤销经历",status:"withdrawn",source_id:null}]);
  expect(text).toContain("[unverified]");expect(text).toContain("src-a");expect(text).not.toContain("已撤销经历");expect(text).not.toContain("已掌握");
 });
 test("deduplicates profile facts but preserves original sources outside compaction",()=>{
  const text=compactProfile([{id:"a",display_text:"同一事实",status:"confirmed",source_id:"s"},{id:"b",display_text:"同一事实",status:"confirmed",source_id:"s"}]);expect(text.match(/同一事实/g)).toHaveLength(1);expect(text).toContain("原始事实和材料未删除");
 });
 test("short followups retain user's topic but not unbounded history",()=>{
  const q=makeLearningQuery("举个例子",["旧主题","如何设计RAG召回评测","Recall和Precision有什么区别"]);expect(q.startsWith("举个例子")).toBe(true);expect(q).toContain("RAG");expect(q).not.toContain("旧主题");
 });
 test("budget includes system, history and retrieved materials",()=>{
  const compiled=compileTutorPrompt({system:LEARNING_SYSTEM,question:"请解释召回",budgetTokens:2000,materials:[
   {kind:"profile_summary",text:"背景".repeat(15000)},
   {kind:"learning_progress",text:"旧学习".repeat(10000)},
  ]});
  expect(estimateTokens(compiled.text)).toBeLessThanOrEqual(2000);
  expect(compiled.text).toContain("请解释召回");
  // 砍过必须留痕：模型要知道自己只看见一半，不能按「全看过」作答。
  expect(compiled.text).toContain("仅见部分内容");
 });
 test("background compaction has a hard size bound",()=>{const p=compactProfile(Array.from({length:200},(_,i)=>({id:String(i),display_text:"材料".repeat(200)+i,status:"confirmed",source_id:String(i)})));expect(p.length).toBeLessThan(5500);});
});
