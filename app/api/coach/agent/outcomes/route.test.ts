import {GET,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/auth");jest.mock("@/lib/db");
const ID="11111111-1111-4111-8111-111111111111";
const body={turnId:ID,requestId:ID,answerDraft:"我的改稿",expectedVersion:0,userId:"other",observedStatus:"独立完成过"};
const request=(b=body)=>new Request("http://localhost/api/coach/agent/outcomes",{method:"POST",body:JSON.stringify(b)});
beforeEach(()=>{jest.resetAllMocks();(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});});
test("成果保存只采用本人登录态与答案，不接收自封的能力评级",async()=>{
 const rpc=jest.fn().mockResolvedValue({data:{id:ID,outcome:{answerDraft:"我的改稿"}},error:null});
 (getDbClient as jest.Mock).mockResolvedValue({rpc});
 expect((await POST(request())).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith("save_coach_outcome",{p_user_id:"owner",p_turn_id:ID,p_answer:"我的改稿",p_expected_version:0,p_request_id:ID});
});
test.each([["outcome_version_conflict",409],["request_reused",409],["source_not_found",404],["source_has_no_outcome",404],["network",503]])("失败 %s 如实返回 %i",async(message,status)=>{
 (getDbClient as jest.Mock).mockResolvedValue({rpc:jest.fn().mockResolvedValue({data:null,error:{message}})});
 expect((await POST(request())).status).toBe(status);
});
test("未登录不调用存储",async()=>{
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
 expect((await POST(request())).status).toBe(401);
 expect((await GET(new Request(`http://localhost?turnId=${ID}`))).status).toBe(401);
 expect(getDbClient).not.toHaveBeenCalled();
});
test("缺请求 ID、负版本、空白稿均不写",async()=>{
 for(const over of [{requestId:""},{expectedVersion:-1},{answerDraft:"   "}])
  expect((await POST(request({...body,...over}))).status).toBe(400);
 expect(getDbClient).not.toHaveBeenCalled();
});
test("刷新读取真实当前版本，并按 owner 与来源过滤",async()=>{
 const chain:Record<string,any>={};for(const name of ["select","eq"])chain[name]=jest.fn(()=>chain);
 chain.maybeSingle=jest.fn().mockResolvedValue({data:{id:ID,version:2,outcome:{answerDraft:"新稿"}},error:null});
 (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>chain)});
 const response=await GET(new Request(`http://localhost?turnId=${ID}`));
 expect((await response.json()).saved).toMatchObject({version:2,outcome:{answerDraft:"新稿"}});
 expect(chain.eq).toHaveBeenCalledWith("user_id","owner");
 expect(chain.eq).toHaveBeenCalledWith("source_turn_id",ID);
 expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
