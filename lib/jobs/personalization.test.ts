import { assessmentPool, eligibility, personalizeJobs, positiveSkillTerms, matchesRequestedSeniority, matchesRequestedSpecialty, resumeEvidence } from "./personalization";
import { callLLM } from "@/lib/llm";
import type { VerifiedJob } from "./verification-gate";
jest.mock("@/lib/llm",()=>({callLLM:jest.fn()}));
jest.mock("@/lib/generation-context",()=>({runWithGenerationContext:(_context:unknown,fn:()=>unknown)=>fn()}));
const job=(id="1",description="负责Agent产品设计，开展需求分析"):VerifiedJob=>({id,description,title:"AI产品经理",company:"测试",location:"北京",url:"https://example.com/"+id,checkedAt:"2026-10-01",publishedAt:null,reasons:[],dedupeKey:id,freshness:"待核实",hardVerdict:"keep",pendingProfileFields:[],jdRequirements:[],companyTier:null,tierLabel:null,tierVerdict:"unsure",tierMatchedField:"target_tiers_empty",tierReason:"",verified:false,tierBasis:null,tierSources:[]});
const resume="负责电商会员、复购与需求分析。没有做过Agent产品，希望转AI方向。";
const item=(id="1")=>({id,resumeEvidenceId:0,jdEvidenceId:0,gap:"Agent产品经历尚未提供",learn:"画出会员助手的任务拆解和失败恢复步骤"});
beforeEach(()=>jest.resetAllMocks());
test('扁平长简历引用是原文短句，不把全简历放进证据',()=>{
 const resume='郭测试，联系方式，'+ '主导智能客服Agent意图识别优化项目，'.repeat(20)+'转人工率下降18%';
 const facts=resumeEvidence(resume);expect(facts.length).toBeGreaterThan(1);expect(facts.every(f=>f.text.length<=180&&resume.includes(f.text))).toBe(true);expect(facts.some(f=>f.text==='主导智能客服Agent意图识别优化项目，')).toBe(true);
});
test.each(["高级产品运营经理", "资深运营", "Senior Operations Manager", "产品运营总监"])("初级求职不推荐%s", title => {
 expect(matchesRequestedSeniority({title}, "用户运营或产品运营", "两年客服。求职方向：希望找上海初级岗位，不考虑销售。")).toBe(false);
});
test("旧初级职位不等于当前职级偏好，普通产品经理也不因经理二字被排除", () => {
 expect(matchesRequestedSeniority({title:"高级产品运营经理"}, "产品运营", "初级客服专员，三年经验。")).toBe(true);
 expect(matchesRequestedSeniority({title:"产品经理"}, "初级产品经理", "负责客服")).toBe(true);
});
test("排除职级后没有候选，不调用模型", async () => {
 const result = await personalizeJobs([{...job(),title:"高级产品运营经理"}], "求职方向：希望找初级岗位", "owner", "run", "产品运营");
 expect(result.jobs).toEqual([]);expect(callLLM).not.toHaveBeenCalled();
});
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
 expect((callLLM as jest.Mock).mock.calls[0][1]).toMatchObject({maxRetries:0,maxTokens:1400,reasoningBudgetTokens:4096,timeoutMs:45000});
});
test("数字字符串引用仅在现有证据编号内归一化，不因此丢掉真实候选", async () => {
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[{...item(),resumeEvidenceId:"0",jdEvidenceId:"0"}]}));
 expect((await personalizeJobs([job()],resume,"owner","run","AI产品经理")).jobs).toHaveLength(1);
});
test("模型返回多条真实引用时逐条核验，再取首条作为卡片主要依据",async()=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[{...item(),resumeEvidenceId:[0,"1"],jdEvidenceId:[0,"1"]}]}));
 const result=await personalizeJobs([job("1","负责Agent产品设计。开展需求分析。")],"负责需求分析。参与Agent产品设计。","owner","run","AI产品经理");
 expect(result.jobs).toHaveLength(1);
 expect(result.jobs[0].review.resumeRefs[0].text).toBe("负责需求分析。");
 expect(result.jobs[0].review.requirementRefs[0].text).toBe("负责Agent产品设计。");
});
test.each([[0,99],[0,null],[],[false,0]].map(ids=>[ids]))("多条引用中存在非法值%j时整条拒绝，不只取有效的第一条",async ids=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[{...item(),jdEvidenceId:ids}]}));
 await expect(personalizeJobs([job()],resume,"owner","run","AI产品经理")).rejects.toThrow("引用核验");
});
test("一条坏引用不拖垮另一条已经核验的推荐，坏项不进入结果", async () => {
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[{...item("2"),jdEvidenceId:99},item()]}));
 const result=await personalizeJobs([job(),job("2")],resume,"owner","run","AI产品经理");
 expect(result.jobs.map(j=>j.id)).toEqual(["1"]);
 expect(result.rejectedCount).toBe(1);
});
test.each(["0x0", "0.0", "", false, null])("非法引用 %j 不当作零号证据",async id=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({items:[{...item(),jdEvidenceId:id}]}));
 await expect(personalizeJobs([job()],resume,"owner","run","AI产品经理")).rejects.toThrow("引用核验");
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
