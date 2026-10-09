import {POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {callLLM} from "@/lib/llm";
import {reserveQuota,finalizeQuota} from "@/lib/quota";
import {buildAgentKnowledgeContext} from "@/lib/knowledge/context";
import { readIntakeResponse } from "@/lib/opportunities/intake-flow";
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
 test("stream phases are emitted from actual processing and terminal failure remains visible",async()=>{
  const progress=jest.fn();
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson","X-Intake-Request-Id":"test-request-123"},body:JSON.stringify({sourceText:"未知材料",requestId:"test-request-123"})}));
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  const body=await readIntakeResponse(response,progress);
  expect(progress.mock.calls).toEqual([["reading","test-request-123"],["analyzing","test-request-123"]]);
  expect(body).toMatchObject({ok:false,status:503,requestId:"test-request-123"});
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
  expect(response.status).toBe(503);
  expect((await response.json()).ok).toBe(false);
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
 test("resume supplement onto a job keeps the stored JD and raw resume even when the model reclassifies to resume-only",async()=>{
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
   resumeText:"教育经历：硕士\n\n实习经历：某大厂产品组",
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
