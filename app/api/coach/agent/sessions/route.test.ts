import {PATCH,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/auth");jest.mock("@/lib/db");
const id="11111111-1111-4111-8111-111111111111";
const request=(expectedSummary:unknown=null)=>new Request("https://example.com/api/coach/agent/sessions",{method:"PATCH",body:JSON.stringify({sessionId:id,summary:"关键收获",expectedSummary})});
beforeEach(()=>jest.resetAllMocks());
function setup(summary:string|null=null){
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
 const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),update:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValueOnce({data:{summary,version:3}}).mockResolvedValueOnce({data:{id}})};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});return q;
}
test("manual notes require authentication",async()=>expect((await PATCH(request())).status).toBe(401));
test("manual notes are scoped to owner and concurrency version",async()=>{
 const q=setup();const r=await PATCH(request());expect(r.status).toBe(200);expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.eq).toHaveBeenCalledWith("version",3);expect(q.update).toHaveBeenCalledWith({summary:"关键收获",version:4});
});
test("stale notes cannot overwrite newer notes",async()=>{const q=setup("另一标签的编辑");expect((await PATCH(request())).status).toBe(409);expect(q.update).not.toHaveBeenCalled();});
test("concurrent turn/archive conflict is not falsely reported saved",async()=>{const q=setup();q.maybeSingle.mockReset().mockResolvedValueOnce({data:{summary:null,version:3}}).mockResolvedValueOnce({data:null});expect((await PATCH(request())).status).toBe(409);});
test("manual note is atomically created archived, owned by authenticated user",async()=>{
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
 const q={insert:jest.fn().mockReturnThis(),select:jest.fn().mockReturnThis(),single:jest.fn().mockResolvedValue({data:{id,summary:"关键收获"}})};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 const r=await POST(new Request("https://example.com",{method:"POST",body:JSON.stringify({note:true,title:"方法",summary:"关键收获",user_id:"attacker"})}));
 expect(r.status).toBe(201);expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({user_id:"owner",status:"archived",summary:"关键收获",opportunity_id:null}));
});
