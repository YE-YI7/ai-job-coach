import { GET } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
jest.mock("@/lib/auth",()=>({getCurrentUserFromRequest:jest.fn()}));
jest.mock("@/lib/db",()=>({getDbClient:jest.fn()}));
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",origin="https://eval.invalid";
let old:string|undefined;
beforeAll(()=>{old=process.env.EVAL_ADMIN_USER_IDS;});
afterAll(()=>{if(old===undefined)delete process.env.EVAL_ADMIN_USER_IDS;else process.env.EVAL_ADMIN_USER_IDS=old;});
beforeEach(()=>{jest.clearAllMocks();process.env.EVAL_ADMIN_USER_IDS="admin";(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"admin"});});
test("private admin access before querying, no user_metadata elevation",async()=>{
  for(const user of [null,{id:"ordinary",user_metadata:{admin:true}}]){(getCurrentUserFromRequest as jest.Mock).mockResolvedValue(user);expect([401,403]).toContain((await GET(new Request(origin))).status);}
  expect(getDbClient).not.toHaveBeenCalled();
});
test("validates ID and reports unavailable without fake demonstration rows",async()=>{
  expect((await GET(new Request(origin+"?id=bogus"))).status).toBe(400);
  (getDbClient as jest.Mock).mockResolvedValue(null);expect((await GET(new Request(origin))).status).toBe(503);
});
test("bounded list and full batch use projected results, never prompts or model execution",async()=>{
  const selects:string[]=[],limits:number[]=[];
  (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>{const q:any={
    select:(v:string)=>{selects.push(v);return q;},eq:()=>q,order:()=>q,limit:(n:number)=>{limits.push(n);return q;},
    maybeSingle:async()=>({data:{id,label:"batch",status:"completed",config:{synthetic:true}},error:null}),
    then:(resolve:(r:unknown)=>unknown)=>resolve({data:table==="coach_eval_runs"?[{id,label:"run",status:"failed",experiment:{batchId:id},metrics:{calls:1},result:{error:"failed"},evaluation:null}]:[],error:null}),
  };return q;}});
  expect((await GET(new Request(origin))).status).toBe(200);
  const response=await GET(new Request(origin+"?id="+id));expect((await response.json()).runs[0]).toMatchObject({status:"failed",metrics:{calls:1},evaluation:null});
  expect(limits).toEqual([30,100]);expect(selects).toContain("id,label,status,experiment:run->experiment,metrics:run->metrics,result:run->result,evaluation:run->evaluation");
});
