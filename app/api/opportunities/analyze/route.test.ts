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
