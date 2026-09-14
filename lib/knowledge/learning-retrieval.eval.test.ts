import {retrieveKnowledgeDocuments} from "./document-repository";
import {makeLearningQuery,learningKnowledgeTask} from "@/lib/coach-harness/learning-memory";
import {learningGuide} from "@/lib/coach-harness/learning-guide";
import type {MentorNextAction} from "@/lib/coach-harness/next-action";
import {compileContextBundle} from "@/lib/coach-harness/context";
import {renderContextForPrompt} from "@/lib/coach-harness/prompt";

// 固定场景先于运行结果定义；测试检索，不把命中率冒充教学效果。
const cases=[
 {topic:"不会做AI评测集，怎么覆盖幻觉、监控和失败恢复？",expected:"pm.ai-evaluation-and-operations.v1"},
 {topic:"面试让我诊断转化率下降，AB实验和指标归因怎么练？",expected:"pm.experiment-and-metric-diagnosis.v1"},
 {topic:"面试问创作者生态、内容治理和平台激励，怎么回答？",expected:"pm.creator-ecosystem-and-content-governance.v1"},
 {topic:"面试要讲搜索推荐广告的召回、排序和供给机制",expected:"pm.search-recommendation-and-ads.v1"},
];
describe("learning retrieval: topic, follow-up and topic switch",()=>{
 test("tight context budget preserves the top retrieved document, not alphabetical ID order",()=>{
  const docs=retrieveKnowledgeDocuments({task:"mock_interview",query:cases[0].topic,role:"产品经理",limit:2});
  const knowledge=docs.map((doc,index)=>({...doc,id:index===0?"z-top":"a-secondary",content:"评测正文".repeat(100),evidenceUrls:[]}));
  const budget=400+Math.ceil("评测正文".repeat(100).length/1.5)+100;
  const bundle=compileContextBundle({userId:"test",task:"mock_interview",claims:[],knowledge,budget:{maxInputTokens:budget}});
  expect(bundle.knowledge.map(k=>k.id)).toEqual(["z-top"]);
 });
 test("hard tenure gates and requested deliverables are explicit tutor rules",()=>{
  expect(learningGuide({reason:"5年经验无证据",title:"岗位要求",tab:"evidence"} as MentorNextAction).prompt).toContain("客观门槛");
 });
 test("actual knowledge body reaches prompt and counts against budget",()=>{
  const doc=retrieveKnowledgeDocuments({task:"mock_interview",query:cases[0].topic,role:"产品经理",limit:1})[0];
  const knowledge=[{...doc,evidenceUrls:doc.evidence.map(e=>e.url)}];
  const bundle=compileContextBundle({userId:"test",task:"mock_interview",claims:[],knowledge});
  expect(renderContextForPrompt(bundle).text).toContain(doc.content);
  const oversized=compileContextBundle({userId:"test",task:"mock_interview",claims:[],knowledge:[{...knowledge[0],content:"超长正文".repeat(30000)}],budget:{maxInputTokens:1000}});
  expect(oversized.knowledge).toHaveLength(0);
 });
 for(const c of cases){
  test.each([false,true])(`${c.expected}, follow-up=%s`,follow=>{
   const query=makeLearningQuery(follow?"没听懂，给我一个例子让我练习":c.topic,follow?[c.topic]:[]);
   const ids=retrieveKnowledgeDocuments({task:learningKnowledgeTask(query),query,role:"产品经理",limit:3}).map(d=>d.id);
   expect(ids).toContain(c.expected);
  });
 }
 test("explicit topic switch excludes previous topic",()=>{
  expect(makeLearningQuery("换个话题，我想练简历",[cases[0].topic])).not.toContain("评测集");
 });
 test("teaching scaffold is concrete and never promotes missing evidence to missing skill",()=>{
  const g=learningGuide({reason:"没有评测集证据",title:"补评测",tab:"evidence"} as MentorNextAction);
  expect(g.steps.join()).toContain("样本");expect(g.example).toContain("会议助手");
  expect(g.prompt).toContain("不要把缺证据当成不会");
 });
});
