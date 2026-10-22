import {POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {callLLM} from "@/lib/llm";
import {reserveQuota,finalizeQuota} from "@/lib/quota";
import {buildAgentKnowledgeContext} from "@/lib/knowledge/context";
import { readIntakeResponse } from "@/lib/opportunities/intake-flow";
import { lookup } from 'node:dns/promises';
jest.mock('node:dns/promises',()=>({lookup:jest.fn()}));
jest.mock("@/lib/auth");
jest.mock("@/lib/llm");
jest.mock("@/lib/quota");
jest.mock("@/lib/knowledge/context");
jest.mock("@/lib/tokenpay-recovery",()=>({tokenPayRecoveryResponse:()=>null}));
describe("material intake on model outage",()=>{
 beforeEach(()=>{
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  (reserveQuota as jest.Mock).mockResolvedValue({source:"free",remaining:3});
  (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
  (buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({items:[],contextText:""});
  (callLLM as jest.Mock).mockRejectedValue(Error("Request timed out"));
 });
 test("explicit resume remains importable without fabricated analysis and failed quota is refunded",async()=>{
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"本人真实经历原文",materialKindHint:"resume"})}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ok:true,analysis:null,analysisDeferred:true,input:{jdText:"",resumeText:"本人真实经历原文"}});
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
 });
 test("save-only extraction never reserves quota or invokes AI",async()=>{
  (reserveQuota as jest.Mock).mockResolvedValue(null);
  const response=await POST(new Request("https://example.com",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"save_only",materialKindHint:"resume",sourceText:"真实简历原文"})}));
  expect(await response.json()).toMatchObject({ok:true,savedOnly:true,input:{resumeText:"真实简历原文"},analysis:null});
  expect(reserveQuota).not.toHaveBeenCalled();expect(callLLM).not.toHaveBeenCalled();
 });
 test("exhausted AI quota does not block retaining original material",async()=>{
  (reserveQuota as jest.Mock).mockResolvedValue(null);
  const response=await POST(new Request("https://example.com",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({materialKindHint:"resume",sourceText:"真实简历原文"})}));
  expect(await response.json()).toMatchObject({ok:true,analysis:null,analysisDeferred:true,reasonCode:"user_quota_exhausted",input:{resumeText:"真实简历原文"}});expect(callLLM).not.toHaveBeenCalled();
 });
 test("stream phases are emitted from actual processing and terminal failure remains visible",async()=>{
  const progress=jest.fn();
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson","X-Intake-Request-Id":"test-request-123"},body:JSON.stringify({sourceText:"未知材料",requestId:"test-request-123"})}));
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  const body=await readIntakeResponse(response,progress);
  expect(progress.mock.calls).toEqual([["reading","test-request-123"],["analyzing","test-request-123"]]);
  expect(body).toMatchObject({ok:true,status:200,analysis:null,analysisDeferred:true,reasonCode:"model_timeout",requestId:"test-request-123"});
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
 });
 test("streaming success retains JSON result and genuine checking phase",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"示例公司",role:"产品经理",location:"上海",jdText:"岗位原文",requirements:[],actions:[]}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify({sourceText:"岗位原文"})}));
  const progress=jest.fn(),body=await readIntakeResponse(response,progress);
  expect(body).toMatchObject({ok:true,status:200,input:{workspaceType:"job",company:"示例公司"}});
  expect(progress.mock.calls.map(c=>c[0])).toEqual(["reading","analyzing","checking"]);
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
 });
 test("unauthenticated streaming request stays HTTP401 and never calls a model",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  const response=await POST(new Request("https://example.com",{method:"POST",headers:{Accept:"application/x-ndjson"}}));
  expect(response.status).toBe(401);expect(callLLM).not.toHaveBeenCalled();
 });
 test("unidentified mixed material is not silently reclassified on failure",async()=>{
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"这是一份未知材料"})}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ok:true,analysis:null,input:{profileText:"这是一份未知材料",jdText:"",resumeText:""}});
 });
 test("new-user pasted JD survives hosted 402 as exact unclassified source, not fake AI analysis",async()=>{
  const text="示例公司招聘产品经理\n岗位职责：梳理需求并跟进交付。\n任职要求：本科，有产品实习经历。";
  (callLLM as jest.Mock).mockRejectedValue(Error("LLM API 调用失败: 402 Insufficient Balance (request_id: private-id)"));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:text})}));
  const body=await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ok:true,analysis:null,analysisDeferred:true,reasonCode:"hosted_provider_quota",retryable:false,input:{workspaceType:"preparation",profileText:text,jdText:"",resumeText:""}});
  expect(JSON.stringify(body)).not.toMatch(/private-id|Insufficient Balance|优先投递/);
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  expect(finalizeQuota).not.toHaveBeenCalledWith(expect.anything(),true);
 });
 test("known job and supplied resume remain exact during hosted exhaustion",async()=>{
  (callLLM as jest.Mock).mockRejectedValue(Error("API 配额不足，请检查账户余额"));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({materialKindHint:"job",company:"示例公司",role:"产品经理",sourceText:"真实JD原文",resumeText:"真实简历原文"})}));
  expect(await response.json()).toMatchObject({analysis:null,reasonCode:"hosted_provider_quota",input:{workspaceType:"job",company:"示例公司",role:"产品经理",jdText:"真实JD原文",resumeText:"真实简历原文"}});
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
 });
 test("hosted quota outage preserves resume-first material without asking users to recharge",async()=>{
  (callLLM as jest.Mock).mockRejectedValue(Error("LLM API 调用失败: insufficient_quota"));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({materialKindHint:"preparation",sourceText:"想做上海产品经理",resumeText:"真实实习原文"})}));
  expect(await response.json()).toMatchObject({analysis:null,reasonCode:"hosted_provider_quota",input:{workspaceType:"preparation",resumeText:"真实实习原文",profileText:"想做上海产品经理"}});
 });
});

describe("supplement keeps the client's ground truth",()=>{
 beforeEach(()=>{
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  (reserveQuota as jest.Mock).mockResolvedValue({source:"free",remaining:3});
  (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
  (buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({items:[],contextText:""});
 });
 test("incomplete model job fields preserve unclassified source without invented analysis",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"",role:"",jdText:""}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"这是我上传的全部原始材料",resumeText:"已保存的基础简历"})}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ok:true,analysis:null,analysisDeferred:true,reasonCode:"classification_incomplete",input:{workspaceType:"preparation",jdText:"",profileText:"这是我上传的全部原始材料",resumeText:"已保存的基础简历"}});
  expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
 });
 test("structured resume alone needs no sourceText or JD",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",jdText:""}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resumeText:"真实简历原文"})}));
  expect(response.status).toBe(200);
  expect((await response.json()).input.resumeText).toBe("真实简历原文");
 });
 test("an unclassified uploaded file survives incomplete model fields as exact source notes",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"",role:"",jdText:""}));
  const form=new FormData();form.set("file",new File(["上传原文：没有额外经历"],"材料.txt",{type:"text/plain"}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",body:form}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({analysis:null,analysisDeferred:true,input:{profileText:"上传原文：没有额外经历",resumeText:"",jdText:""}});
 });
 test("model recognizing a pasted resume cannot replace its original wording",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"resume",resumeText:"模型添加的经历"}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"只做过真实实习"})}));
  expect((await response.json()).input.resumeText).toBe("只做过真实实习");
 });
 test("new job inherits exact base resume rather than model paraphrase",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"示例公司",role:"产品经理",jdText:"负责产品规划",resumeText:"模型擅自改写的经历"}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"示例公司招聘产品经理，负责产品规划",resumeText:"基础简历：只做过人工抽检"})}));
  expect(response.status).toBe(200);expect((await response.json()).input.resumeText).toBe("基础简历：只做过人工抽检");
 });
 test("resume-first entry is a preparation profile even when model misclassifies it as an empty job",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"",role:"产品经理",jdText:"",resumeText:"模型改写"}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({materialKindHint:"preparation",sourceText:"希望做产品经理",resumeText:"原始实习经历"})}));
  expect(response.status).toBe(200);
  expect((await response.json()).input).toMatchObject({workspaceType:"preparation",resumeText:"原始实习经历",jdText:"",role:"产品经理"});
 });
 test("replacing a job resume keeps its JD and uses only the new original, not the model rewrite",async()=>{
  // 复现用户报的路径：先传 JD 建成岗位，再传简历。模型把整包材料误判成 materialKind=resume
  // 且按要求返回空 jdText、转写版 resumeText——旧逻辑据此清空 JD、翻成准备档案。
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
   materialKind:"resume",company:"字节跳动",role:"AI 产品经理",jdText:"",
   resumeText:"模型整理后的残缺版",recommendation:"apply",recommendationLabel:"优先投递",recommendationReason:"匹配。",
  }));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   materialKindHint:"resume",company:"字节跳动",role:"AI 产品经理",location:"上海",
   jdText:"负责 Agent 产品规划，本科及以上学历",resumeText:"教育经历：硕士",sourceText:"实习经历：某大厂产品组",
  })}));
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body.ok).toBe(true);
  expect(body.input).toMatchObject({
   workspaceType:"job",
   jdText:"负责 Agent 产品规划，本科及以上学历",
   resumeText:"实习经历：某大厂产品组",
  });
 });
 test("resume supplement onto a preparation workspace stays preparation",async()=>{
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"某公司",role:"某岗位",jdText:"模型不该写 JD",resumeText:""}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   materialKindHint:"resume",company:"",role:"",location:"",jdText:"",resumeText:"",sourceText:"本科 计算机 两年实习",
  })}));
  const body=await response.json();
  expect(body.input.workspaceType).toBe("preparation");
  expect(body.input.jdText).toBe("");
  expect(body.input.resumeText).toBe("本科 计算机 两年实习");
 });
});

describe("public JD URL intake",()=>{
 beforeEach(()=>{
  jest.resetAllMocks();
  // Public fixtures must not depend on the developer's proxy/DNS. Every HTTP
  // response and the model are mocked; an unconfigured fetch fails closed.
  (lookup as jest.Mock).mockResolvedValue([{address:'8.8.8.8',family:4}]);
  jest.spyOn(globalThis,'fetch').mockRejectedValue(Error('Unexpected network request in JD fixture'));
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  (reserveQuota as jest.Mock).mockResolvedValue({source:"free",remaining:3});
  (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
  (buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({items:[],contextText:""});
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({materialKind:"job",company:"示例科技",role:"AI 产品经理",location:"上海",jdText:"岗位职责与任职要求",requirements:[],actions:[]}));
 });
 afterEach(()=>jest.restoreAllMocks());

 test("fetches a JD URL wrapped in a short label and reads JobPosting JSON-LD",async()=>{
  const url="https://8.8.8.8/jobs/pm?id=123";
  const html=`<html><head><script type="application/ld+json">${JSON.stringify({
   "@context":"https://schema.org","@type":"JobPosting",title:"AI 产品经理",
   hiringOrganization:{name:"示例科技"},jobLocation:{address:{addressLocality:"上海"}},
   description:"负责 AI 产品规划、需求分析、跨团队协作与项目交付。",
   qualifications:"本科及以上学历，具备产品设计和数据分析经验。",
  })}</script></head><body><div id="app"></div></body></html>`;
  const fetchMock=jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:`JD 链接：\n${url}`})}));
  expect(response.status).toBe(200);
  const input=(await response.json()).input;
  expect(input).toMatchObject({workspaceType:"job",sourceLabel:"岗位链接导入"});
  expect(input.jdText).toContain(`来源链接：${url}`);
  expect(input.jdText).toContain("负责 AI 产品规划、需求分析、跨团队协作与项目交付。");
  expect(input.jdText).not.toBe("岗位职责与任职要求");
  expect(fetchMock).toHaveBeenCalledWith(new URL(url),expect.objectContaining({redirect:"manual"}));
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain("任职要求：本科及以上学历");
 });

 test("reads the exact Manus role from its public careers API when the page is a client-rendered shell",async()=>{
  const jobs=[{id:"3b841ff5-ef2e-4ea7-92f0-d0fc3ef0cad6",title:"Agent 产品经理",type:"全职",locations:["北京"],summary:"负责智能体产品从需求定义到上线迭代。",descriptionHtml:"<p><strong>岗位职责</strong></p><ul><li>研究用户需求与实际工作流程。</li><li>完成产品原型并协调研发交付。</li></ul><p><strong>任职要求</strong></p><ul><li>具备 AI 产品设计或开发经验。</li><li>能够通过原型或技术实验验证产品想法。</li></ul>"}];
  (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({materialKind:"job",company:"Manus",role:"Agent 产品经理",location:"北京",jdText:"岗位职责与任职要求",requirements:[],actions:[]}));
  const fetchMock=jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({result:{data:{json:jobs}}}),{status:200,headers:{"content-type":"application/json"}}));
  const url="https://careers.manus.im/cn/job/3b841ff5-ef2e-4ea7-92f0-d0fc3ef0cad6";
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:url})}));
  expect(response.status).toBe(200);
  expect((await response.json()).input).toMatchObject({workspaceType:"job",company:"Manus",role:"Agent 产品经理",location:"北京",sourceLabel:"岗位链接导入"});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("/api/trpc/hr/applications.publicJobs");
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain("职位：Agent 产品经理");
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain("能够通过原型或技术实验验证产品想法");
  expect(callLLM).toHaveBeenCalledTimes(1);
 });

 test.each([
  {provider:"Greenhouse",url:"https://boards.greenhouse.io/example/jobs/12345",api:"boards-api.greenhouse.io",title:"产品经理",payload:{id:12345,title:"产品经理",location:{name:"上海"},content:"<p>负责产品规划、用户研究、跨部门协作与上线迭代。要求具备复杂产品的端到端交付经验。</p>"}},
  {provider:"Lever",url:"https://jobs.eu.lever.co/example/12345678-abcd-4321-abcd-123456789abc",api:"api.eu.lever.co",title:"AI 产品经理",payload:{id:"12345678-abcd-4321-abcd-123456789abc",text:"AI 产品经理",categories:{location:"上海"},descriptionPlain:"负责 AI 产品规划和智能体应用落地，推进研发协作与数据驱动迭代。要求有产品交付和技术实验经验。"}},
  {provider:"Ashby",url:"https://jobs.ashbyhq.com/example/12345678-abcd-4321-abcd-123456789abc",api:"api.ashbyhq.com",title:"AI 产品经理",payload:{jobs:[{title:"AI 产品经理",location:"上海",jobUrl:"https://jobs.ashbyhq.com/example/12345678-abcd-4321-abcd-123456789abc",descriptionPlain:"负责 AI 产品规划和智能体应用落地，推进研发协作与数据驱动迭代。要求有产品交付和技术实验经验。"}]}},
 ])("uses the $provider public job-posting endpoint rather than parsing its SPA shell",async({url,api,title,payload})=>{
  const fetchMock=jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:url})}));
  expect(response.status).toBe(200);
  expect((await response.json()).input.sourceLabel).toBe("岗位链接导入");
  expect(String(fetchMock.mock.calls[0][0])).toContain(api);
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain(title);
  expect(callLLM).toHaveBeenCalledTimes(1);
 });

 test.each(['198.18.0.1','127.0.0.1','10.0.0.1'])('still blocks a hostname resolving to protected %s before HTTP, quota or model',async(address)=>{
  (lookup as jest.Mock).mockResolvedValue([{address,family:4}]);
  const response=await POST(new Request('https://example.com/api/opportunities/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceText:'https://careers.example.org/jobs/one'})}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ok:false,error:expect.stringContaining('不能读取内网地址')});
  expect(fetch).not.toHaveBeenCalled();expect(reserveQuota).not.toHaveBeenCalled();expect(callLLM).not.toHaveBeenCalled();
 });

 test("extracts generic JSON application state from common server-rendered SPA shells",async()=>{
  const state={props:{pageProps:{job:{title:"数据产品经理",companyName:"示例公司",location:"杭州",descriptionHtml:"<p>负责数据产品规划、需求分析、跨团队协作及上线迭代。要求具备产品设计、数据分析和项目交付经验。</p>"}}}};
  jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script><div id="root"></div></html>`,{status:200,headers:{"content-type":"text/html"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/jobs/data-pm"})}));
  expect(response.status).toBe(200);
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain("数据产品经理");
  expect((callLLM as jest.Mock).mock.calls[0][0][1].content).toContain("杭州");
 });

 test("extracts schema.org JobPosting microdata without a platform-specific adapter",async()=>{
  const html=`<main itemscope itemtype="https://schema.org/JobPosting">
   <h1 itemprop="title">供应链产品经理</h1>
   <span itemprop="hiringOrganization">示例制造</span>
   <div itemprop="jobLocation">苏州</div>
   <div itemprop="description"><p>负责供应链系统规划、订单履约流程优化、需求分析、跨团队交付和上线后的持续运营。</p><p>要求具备企业软件产品经验，能够使用数据定位流程问题并推动方案落地。</p></div>
  </main>`;
  jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(html,{status:200,headers:{"content-type":"text/html"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/jobs/scm"})}));
  expect(response.status).toBe(200);
  const prompt=(callLLM as jest.Mock).mock.calls[0][0][1].content;
  expect(prompt).toContain("供应链产品经理");
  expect(prompt).toContain("示例制造");
  expect(prompt).toContain("苏州");
  expect(prompt).toContain("订单履约流程优化");
 });

 test("reads semantic job content and page metadata on a generic careers site",async()=>{
  const html=`<html><head><title>数据分析师 - 示例集团</title><meta property="og:site_name" content="示例集团"><meta name="description" content="负责经营数据分析、指标体系建设、专题研究与业务决策支持；要求熟悉 SQL、统计分析和跨团队沟通。"></head><body><nav>首页 招聘 社会招聘</nav><main><h1>数据分析师</h1><p>负责经营数据分析、指标体系建设、专题研究与业务决策支持；要求熟悉 SQL、统计分析和跨团队沟通。</p></main></body></html>`;
  jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(html,{status:200,headers:{"content-type":"text/html"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/careers/role"})}));
  expect(response.status).toBe(200);
  const prompt=(callLLM as jest.Mock).mock.calls[0][0][1].content;
  expect(prompt).toContain("数据分析师");
  expect(prompt).toContain("经营数据分析");
  expect(prompt).not.toContain("首页 招聘 社会招聘");
 });

 test("validates each redirect destination before making the next request",async()=>{
  const fetchMock=jest.spyOn(globalThis,"fetch")
   .mockResolvedValueOnce(new Response(null,{status:302,headers:{location:"http://127.0.0.1/private"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/redirect"})}));
  expect(response.status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await response.json()).toMatchObject({ok:false,error:expect.stringMatching(/内网|不能读取/)});
 });

 test("does not fetch an incidental URL embedded in long text",async()=>{
  const fetchMock=jest.spyOn(globalThis,"fetch");
  const sourceText=`这是简历内容，项目说明和经历非常完整，下面是多段工作记录和负责范围。参考链接：https://8.8.8.8/jobs/pm，后面还有更多项目补充说明、关键产出、协作对象和背景信息。`;
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText})}));
  expect(response.status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
 });

 test("explains when a public page requires login or client-side rendering",async()=>{
  jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response("<html><div id=\"app\"></div><script>startApp()</script></html>",{status:200,headers:{"content-type":"text/html"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/jobs/private"})}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ok:false,error:expect.stringContaining("可能需要登录或由页面脚本加载")});
  expect(finalizeQuota).not.toHaveBeenCalled();
 });

 test("turns common anti-bot and login HTTP responses into a safe manual-paste instruction",async()=>{
  jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response("",{status:403,headers:{"content-type":"text/html"}}));
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"https://8.8.8.8/jobs/restricted"})}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ok:false,error:expect.stringContaining("拒绝了自动读取请求（403）")});
  expect(reserveQuota).not.toHaveBeenCalled();
 });
});
