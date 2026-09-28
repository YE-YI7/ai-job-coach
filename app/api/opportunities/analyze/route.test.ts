import {POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {callLLM} from "@/lib/llm";
import {reserveQuota,finalizeQuota} from "@/lib/quota";
import {buildAgentKnowledgeContext} from "@/lib/knowledge/context";
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
 test("unidentified mixed material is not silently reclassified on failure",async()=>{
  const response=await POST(new Request("https://example.com/api/opportunities/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceText:"这是一份未知材料"})}));
  expect(response.status).toBe(503);
  expect((await response.json()).ok).toBe(false);
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
