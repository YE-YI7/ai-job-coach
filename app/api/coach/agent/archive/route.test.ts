import {POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {callLLM} from "@/lib/llm";
import {readLearningSession} from "@/lib/coach-harness/learning-memory";
jest.mock("@/lib/auth");jest.mock("@/lib/db");jest.mock("@/lib/llm");jest.mock("@/lib/coach-harness/learning-memory");
jest.mock("@/lib/metered-ai-route",()=>({withMeteredAiRoute:(h:unknown)=>h}));
const sid="11111111-1111-4111-8111-111111111111";
const request=()=>new Request("https://example.com/api/coach/agent/archive",{method:"POST",body:JSON.stringify({sessionId:sid})});
describe("learning archive",()=>{
 beforeEach(()=>{jest.resetAllMocks();(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});});
 test("denies unauthenticated calls",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect(callLLM).not.toHaveBeenCalled();});
 test("cannot read another user's session",async()=>{(readLearningSession as jest.Mock).mockResolvedValue(null);expect((await POST(request())).status).toBe(404);expect(readLearningSession).toHaveBeenCalledWith("owner",sid);expect(callLLM).not.toHaveBeenCalled();});
 test("repeat archive returns the stored summary without another model call",async()=>{(readLearningSession as jest.Mock).mockResolvedValue({id:sid,status:"archived",summary:"原笔记"});expect((await (await POST(request())).json()).summary).toBe("原笔记");expect(callLLM).not.toHaveBeenCalled();});
 test.each([true,false])("archive save is truthful, conflict=%s",async(conflict)=>{
  (readLearningSession as jest.Mock).mockResolvedValue({id:sid,status:"active",version:3,title:"练习"});
  const turns={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[{id:"turn-1",question:"我的回答",answer:"反馈"}],error:null})};
  const save={update:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),select:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:conflict?null:{id:sid},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:(name:string)=>name==="coach_agent_turns"?turns:save});(callLLM as jest.Mock).mockResolvedValue("已练习，迁移题待验证");
  const r=await POST(request());const b=await r.json();expect(r.status).toBe(conflict?409:200);expect(Boolean(b.ok)).toBe(!conflict);expect(save.eq).toHaveBeenCalledWith("version",3);expect(save.eq).toHaveBeenCalledWith("user_id","owner");expect(turns.eq).toHaveBeenCalledWith("session_id",sid);
 });
});
