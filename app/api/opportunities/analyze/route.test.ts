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
