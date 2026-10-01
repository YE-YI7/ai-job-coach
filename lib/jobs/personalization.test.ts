import { assessmentPool, eligibility, personalizeJobs, positiveSkillTerms, matchesRequestedSpecialty, resumeEvidence } from "./personalization";
import { callLLM } from "@/lib/llm";
import type { VerifiedJob } from "./verification-gate";
jest.mock("@/lib/llm",()=>({callLLM:jest.fn()}));
jest.mock("@/lib/generation-context",()=>({runWithGenerationContext:(_context:unknown,fn:()=>unknown)=>fn()}));
const job=(id="1",description="负责Agent产品设计，开展需求分析"):VerifiedJob=>({id,description,title:"AI产品经理",company:"测试",location:"北京",url:"https://example.com/"+id,checkedAt:"2026-10-01",publishedAt:null,reasons:[],dedupeKey:id,freshness:"待核实",hardVerdict:"keep",pendingProfileFields:[],jdRequirements:[],companyTier:null,tierLabel:null,tierVerdict:"unsure",tierMatchedField:"target_tiers_empty",tierReason:"",verified:false,tierBasis:null,tierSources:[]});
const resume="负责电商会员、复购与需求分析。没有做过Agent产品，希望转AI方向。";
const item=(id="1")=>({id,resumeEvidenceId:0,jdEvidenceId:0,gap:"Agent产品经历尚未提供",learn:"画出会员助手的任务拆解和失败恢复步骤"});
beforeEach(()=>jest.resetAllMocks());
test("否定与学习愿望不算技能经历",()=>expect(positiveSkillTerms(resume,["agent","需求分析"])).toEqual(["需求分析"]));
test("assessment budget shared across employers, not consumed by first company's many postings",()=>{
 const jobs=Array.from({length:30},(_,i)=>({...job(String(i)),company:"第一家公司"}));
 jobs.push({...job("other"),company:"制造企业"});
 const pool=assessmentPool(jobs,resume);
 expect(pool).toHaveLength(16);expect(pool.some(j=>j.id==="other")).toBe(true);
});
test("AI方向不接受纯广告或普通增长岗位，AI要求必须来自JD",()=>{
 expect(matchesRequestedSpecialty({title:"广告产品经理",description:"ADX竞价、促销转化分析"},"AI 产品经理")).toBe(false);
 expect(matchesRequestedSpecialty({title:"产品经理",description:"负责大模型Agent平台"},"AI 产品经理")).toBe(true);
});
test("8年经验不等于非在读，未知资格明确提示",()=>{
 const marked=eligibility(job("1","岗位要求：大三在校学生，负责产品设计"),"本科，8年产品经验");
 expect(marked.jdRequirements.some(r=>r.label==="在读身份待核实")).toBe(true);
 expect(marked.reasons.join()).toContain("不作为优先推荐");
 expect(eligibility(job("1","在读学生"),"目前在读硕士").reasons).toEqual([]);
});
test("官网地点和标题冲突不能静默宣称匹配城市",()=>{
 const marked=eligibility({...job(),title:"AI产品经理（深圳）",location:"北京"},resume);
 expect(marked.location).toContain("待核实");
 expect(marked.reasons.join()).toContain("官网地点字段为北京");
});
test("一次模型调用产生带核验引用和练习的推荐",async()=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[item()]}));
 const result=await personalizeJobs([job()],resume,"owner","run","AI 产品经理");
 expect(result.jobs[0].reasons.join()).toContain("电商会员");
 expect(result.jobs[0].reasons.join()).toContain("可以先练");
 expect(result.modelCalls).toBe(1);expect(callLLM).toHaveBeenCalledTimes(1);
 expect((callLLM as jest.Mock).mock.calls[0][1]).toMatchObject({maxRetries:0,maxTokens:1400});
});
test("逐字引用包含句末标点仍有效，不能把有效引用误报失败",async()=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[item()]}));
 const result=await personalizeJobs([job()],resume,"owner","run","AI 产品经理");
 expect(result.jobs[0].reasons[0]).toContain("需求分析。");
});
test.each([
 {items:[{...item(),id:"unknown"}]},
 {items:[{...item(),resumeEvidenceId:99}]},
 {items:[{...item(),resumeEvidenceId:1}]},
 {items:[{...item(),jdEvidenceId:99}]},
 {items:[item(),item()]},
 {other:[]},
])("引用伪造、否定经历或非法列表如实失败：%j",async payload=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify(payload));
 await expect(personalizeJobs([job()],resume,"owner","run","AI 产品经理")).rejects.toThrow();
});
test("空候选不消耗模型额度",async()=>{
 expect(await personalizeJobs([],resume,"owner","run","AI 产品经理")).toEqual({jobs:[],modelCalls:0,evaluatedCount:0});
 expect(callLLM).not.toHaveBeenCalled();
});
test("模型失败不返回伪个性化结果",async()=>{
 (callLLM as jest.Mock).mockRejectedValue(new Error("model unavailable"));
 await expect(personalizeJobs([job()],resume,"owner","run","AI 产品经理")).rejects.toThrow("unavailable");
});
test("没有适合岗位可以返回空列表，不凑数不假装模型故障",async()=>{
 (callLLM as jest.Mock).mockResolvedValue('{"items":[]}');
 expect((await personalizeJobs([job()],resume,"owner","run","AI 产品经理")).jobs).toEqual([]);
});
test("证据编号只包含肯定经历，模型无法截去‘没有’制造经历",()=>{
 expect(resumeEvidence(resume)).toEqual([{id:0,text:"负责电商会员、复购与需求分析。"}]);
});
