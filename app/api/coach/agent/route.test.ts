import {GET,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {callLLM} from "@/lib/llm";
import {resolveChatModel} from "@/lib/coach-harness/chat-models";
import {getContextBundleForUser} from "@/lib/coach-harness/repository";
jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/llm");
jest.mock("@/lib/metered-ai-route",()=>({withMeteredAiRoute:(handler:unknown)=>handler}));
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/coach-harness/chat-models");
jest.mock("@/lib/coach-harness",()=>({assertContextFits:jest.fn(),renderContextForPrompt:()=>({text:"context"})}));
function setupGeneration(saveError=false){
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
 const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),is:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),insert:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[]}),maybeSingle:jest.fn().mockResolvedValue({data:null}),single:jest.fn().mockResolvedValue(saveError?{error:{message:"db down"}}:{data:{id:"saved"}})};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 (getContextBundleForUser as jest.Mock).mockResolvedValue({knowledge:[]});
 (resolveChatModel as jest.Mock).mockResolvedValue({model:"glm-5.3"});
 return q;
}
function streamRequest(mode="auto") {return new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:JSON.stringify({modelMode:mode,message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})});}
describe("agent boundary",()=>{
 beforeEach(()=>jest.resetAllMocks());
 test("streams deltas, then persisted answer and structured suggestions",async()=>{
  const q=setupGeneration();
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("开始解释");expect(q.insert).not.toHaveBeenCalled();return '开始解释<followups>["继续"]</followups>';});
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events[1]).toEqual({type:"delta",text:"开始解释"});
  expect(events.at(-1)).toMatchObject({ok:true,id:"saved",answer:"开始解释",learning_trace:{suggestions:["继续"]}});
  expect(q.insert).toHaveBeenCalledTimes(1);
 });
 test("storage failure never emits successful completion",async()=>{
  setupGeneration(true);(callLLM as jest.Mock).mockResolvedValue("回答");
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1).ok).not.toBe(true);expect(events.at(-1).error).toContain("未确认保存");
 });
 test("auto retries timeout once on Flash before any output",async()=>{
  setupGeneration();(callLLM as jest.Mock).mockRejectedValueOnce(Error("Request timed out.")).mockResolvedValueOnce("回答");
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(callLLM).toHaveBeenCalledTimes(2);expect((callLLM as jest.Mock).mock.calls[1][1].model).toBe("deepseek-v4-flash");
  expect(events.at(-1)).toMatchObject({ok:true,learning_trace:{modelCalls:2,model:"deepseek-v4-flash"}});
 });
 test.each(["partial","explicit","balance"])("does not silently retry %s",async(kind)=>{
  setupGeneration();(callLLM as jest.Mock).mockImplementation(async(_m,o)=>{if(kind==="partial")o.onDelta("一部分");throw Error(kind==="balance"?"TokenPay 余额不足":"Request timed out.");});
  await (await POST(streamRequest(kind==="explicit"?"glm-5.3":"auto"))).text();
  expect(callLLM).toHaveBeenCalledTimes(1);
 });
 test("streamed unauthorized response never emits model text",async()=>{
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:"{}"}));
  const events=(await response.text()).trim().split("\n").map(line=>JSON.parse(line));
  expect(events.at(-1)).toMatchObject({type:"done",error:"请先登录"});
  expect(events.some(e=>e.type==="delta")).toBe(false);
  expect(callLLM).not.toHaveBeenCalled();
 });
 test("unauthenticated history is denied",async()=>{expect((await GET(new Request("https://example.com/api/coach/agent"))).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();});
 test("malformed scope rejected",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await GET(new Request("https://example.com/api/coach/agent?opportunityId=wrong"))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("empty submission rejected before database",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:""})}))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("history is owner and scope filtered and uncached",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),is:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[],error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await GET(new Request("https://example.com/api/coach/agent"));expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.is).toHaveBeenCalledWith("opportunity_id",null);expect(res.headers.get("cache-control")).toContain("no-store");
 });
 test("retry reuses the persisted answer without another model call",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"已保存回复",opportunity_id:null},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(200);expect((await res.json()).answer).toBe("已保存回复");expect(callLLM).not.toHaveBeenCalled();expect(q.eq).toHaveBeenCalledWith("user_id","owner");
 });
 test("a request id cannot reuse another opportunity's answer",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"private",opportunity_id:"22222222-2222-4222-8222-222222222222"},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(409);expect((await res.json()).answer).toBeUndefined();expect(callLLM).not.toHaveBeenCalled();
 });
});
