import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { feedbackHash, parseEvalFeedback } from "@/lib/coach-harness/eval-feedback";
jest.mock("@/lib/auth",()=>({getCurrentUserFromRequest:jest.fn()}));
jest.mock("@/lib/db",()=>({getDbClient:jest.fn()}));
const actor = "admin", origin="https://example.invalid";
const body={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",runId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",changeId:"real-change",scope:"change",category:"format",verdict:"improve",note:"段首概括与其他条目不一致",expected:"保留条目结构，重写空泛的小标题"};
const make=(b:unknown=body,site=origin)=>new Request(`${origin}/api/admin/eval-feedback`,{method:"POST",headers:{origin:site},body:JSON.stringify(b)});
let old:string|undefined;
beforeAll(()=>{old=process.env.EVAL_ADMIN_USER_IDS;});
afterAll(()=>{if(old===undefined)delete process.env.EVAL_ADMIN_USER_IDS;else process.env.EVAL_ADMIN_USER_IDS=old;});
beforeEach(()=>{jest.clearAllMocks();process.env.EVAL_ADMIN_USER_IDS=actor;(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:actor});});
function mockDb(options:{changes?:string[];insertError?:string;hash?:string;unavailable?:boolean}={}) {
  const stored={id:body.runId,user_id:"derived-owner",legacy_trace_id:body.runId,run:{result:{output:"preview text",rawResponse:{changes:(options.changes||["real-change"]).map(id=>({id}))}}}};
  const rows:unknown[]=[];
  const from=jest.fn((table:string)=>{
    const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      maybeSingle:async()=>({data:table==="coach_eval_runs"?stored:{...body,content_hash:options.hash},error:null}),
      insert:(row:unknown)=>{rows.push(row);return query;},
      single:async()=>({data:{id:body.id,run_id:body.runId,change_id:body.changeId},error:options.insertError?{code:options.insertError}:null}),
      then:(resolve:(r:unknown)=>unknown)=>resolve({data:[],error:null})};return query;
  });
  (getDbClient as jest.Mock).mockResolvedValue(options.unavailable?null:{from});return {rows,from};
}
test("auth is required before DB access; no role from editable user metadata",async()=>{
  for(const user of [null,{id:"ordinary",user_metadata:{admin:true}}]){
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);
    expect([401,403]).toContain((await POST(make())).status);
    expect([401,403]).toContain((await GET(new Request(origin))).status);
  }expect(getDbClient).not.toHaveBeenCalled();
});
test("CSRF and identity/resume injection rejected",async()=>{
  expect((await POST(make(body,"https://evil.invalid"))).status).toBe(403);
  for(const extra of [{userId:"owner"},{resumeText:"private"},{changeId:null},{scope:"whole_document"}])
    expect((await POST(make({...body,...extra}))).status).toBe(400);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("accepts only actual delivered change IDs; derives actor and subject",async()=>{
  const {rows,from}=mockDb();expect((await POST(make())).status).toBe(200);
  expect(rows[0]).toMatchObject({actor_user_id:actor,subject_user_id:"derived-owner",change_id:"real-change"});
  expect(from.mock.calls.map(c=>c[0])).toEqual(["coach_eval_runs","coach_eval_feedback"]);
  mockDb({changes:["other"]});expect((await POST(make())).status).toBe(400);
});
test("same ID same normalized content replays; differing content conflicts",async()=>{
  mockDb({insertError:"23505",hash:feedbackHash(parseEvalFeedback(body)!,actor)});
  expect(await (await POST(make())).json()).toMatchObject({ok:true,replayed:true});
  mockDb({insertError:"23505",hash:"different"});expect((await POST(make())).status).toBe(409);
});
test("database failure never reports saved; GET bounded and read only",async()=>{
  mockDb({unavailable:true});expect((await POST(make())).status).toBe(503);
  const {rows,from}=mockDb();expect((await GET(new Request(`${origin}?runId=${body.runId}`))).status).toBe(200);
  expect(rows).toEqual([]);expect(from.mock.calls.map(c=>c[0])).toEqual(["coach_eval_feedback"]);
});
