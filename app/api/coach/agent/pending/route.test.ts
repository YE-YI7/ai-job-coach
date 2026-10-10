import {GET,POST,DELETE} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {readLearningSession} from "@/lib/coach-harness/learning-memory";
jest.mock("@/lib/auth");jest.mock("@/lib/db");jest.mock("@/lib/coach-harness/learning-memory");
const sessionId="11111111-1111-4111-8111-111111111111",requestId="22222222-2222-4222-8222-222222222222";
const body={sessionId,requestId,text:"这是我独立写下的回答"};
const req=(method="POST",value:unknown=body)=>new Request(`https://example.com/api/coach/agent/pending?sessionId=${sessionId}`,{method,...(method==="GET"?{}:{body:JSON.stringify(value)})});
function setup(){
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
 (readLearningSession as jest.Mock).mockResolvedValue({id:sessionId,status:"active",opportunity_id:null});
 const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn(),in:jest.fn(),insert:jest.fn().mockResolvedValue({error:null}),delete:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:null,error:null})};
 q.limit.mockResolvedValue({data:[],error:null});q.in.mockResolvedValue({data:[],error:null});
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});return q;
}
beforeEach(()=>jest.resetAllMocks());
test("requires login before touching any source",async()=>{expect((await POST(req())).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();});
test("a foreign session cannot be read, written or deleted",async()=>{const q=setup();(readLearningSession as jest.Mock).mockResolvedValue(null);for(const method of [GET,POST,DELETE])expect((await method(req())).status).toBe(404);expect(q.insert).not.toHaveBeenCalled();expect(q.delete).not.toHaveBeenCalled();});
test("free answer source is owned, session bound, and not a confirmed claim",async()=>{const q=setup();expect((await POST(req())).status).toBe(201);expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({id:requestId,user_id:"owner",source_type:"user_answer",content:body.text,metadata:{kind:"pending_answer",sessionId,requestId}}));});
test("same request replays without writing, changed text is a conflict",async()=>{const q=setup();q.maybeSingle.mockResolvedValue({data:{content:body.text}});expect((await POST(req())).status).toBe(200);expect((await POST(req("POST",{...body,text:"不同内容"}))).status).toBe(409);expect(q.insert).not.toHaveBeenCalled();});
test("colliding foreign source cannot be overwritten",async()=>{const q=setup();q.insert.mockResolvedValue({error:{code:"23505"}});expect((await POST(req())).status).toBe(409);expect(q.maybeSingle).toHaveBeenCalledTimes(2);expect(q.eq).toHaveBeenCalledWith("user_id","owner");});
test("completed turn is not restored if cleanup fails",async()=>{const q=setup();q.limit.mockResolvedValue({data:[{id:requestId,content:body.text,metadata:body}]});q.in.mockResolvedValue({data:[{request_id:requestId}]});expect(await (await GET(req("GET"))).json()).toMatchObject({ok:true,pending:null,completedRequestIds:[requestId]});});
test("pending answer survives reload without model calls",async()=>{const q=setup();q.limit.mockResolvedValue({data:[{id:requestId,content:body.text,metadata:body}]});expect(await (await GET(req("GET"))).json()).toMatchObject({ok:true,pending:body});});
test("database failure is never called saved",async()=>{const q=setup();q.insert.mockResolvedValue({error:{code:"XX"}});expect((await POST(req())).status).toBe(503);});
test("a completed newest answer cannot resurrect an older failed draft",async()=>{const q=setup();q.limit.mockResolvedValue({data:[{id:requestId,content:body.text,metadata:{...body,status:"completed"}},{id:"33333333-3333-4333-8333-333333333333",content:"旧回答",metadata:body}]});expect(await (await GET(req("GET"))).json()).toMatchObject({ok:true,pending:null});});
