import {boundedLearningPrompt,compactProfile,makeLearningQuery,LEARNING_SYSTEM} from "./learning-memory";
import {estimateTokens} from "./context";
jest.mock("@/lib/db");
describe("learning memory",()=>{
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
  const p=boundedLearningPrompt("请解释召回",["背景".repeat(15000),"旧学习".repeat(10000)],2000);
  expect(estimateTokens(p)+estimateTokens(LEARNING_SYSTEM)).toBeLessThanOrEqual(2000);expect(p).toContain("请解释召回");expect(p).toContain("节选");
 });
 test("background compaction has a hard size bound",()=>{const p=compactProfile(Array.from({length:200},(_,i)=>({id:String(i),display_text:"材料".repeat(200)+i,status:"confirmed",source_id:String(i)})));expect(p.length).toBeLessThan(5500);});
});
