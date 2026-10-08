import {getDbClient} from "@/lib/db";
import {listJobDecisions,saveJobDecision} from "./repository";
import type {JobDecision} from "@/lib/jobs/job-decision";
jest.mock("@/lib/db");
const RUN="11111111-1111-4111-8111-111111111111";
const REQUEST="22222222-2222-4222-8222-222222222222";
const input:Omit<JobDecision,"claimId"|"savedAt">={jobId:"j1",url:"https://example.com/jobs/1",company:"示例",title:"产品实习",location:"北京",decision:"verify",reason:null,batchRunId:RUN,materialsVersion:"a".repeat(64)};
beforeEach(()=>jest.resetAllMocks());
test("保存只调用原子事务，不能在应用层先撤回旧决定",async()=>{
 const rpc=jest.fn().mockResolvedValue({data:{id:"saved",value:input,updated_at:"2026-10-08T00:00:00Z"},error:null});
 const from=jest.fn();
 (getDbClient as jest.Mock).mockResolvedValue({rpc,from});
 expect(await saveJobDecision("owner",input,{requestId:REQUEST,expectedClaimId:null})).toMatchObject({claimId:"saved",batchRunId:RUN});
 expect(from).not.toHaveBeenCalled();
 expect(rpc).toHaveBeenCalledWith("save_coach_job_decision",expect.objectContaining({p_user_id:"owner",p_request_id:REQUEST,p_expected_claim_id:null,p_entity_key:`job_decision:${RUN}:https://example.com/jobs/1`}));
});
test.each(["db down","decision_version_conflict","job_not_in_batch"])("事务失败 %s 不说成功",async(message)=>{
 (getDbClient as jest.Mock).mockResolvedValue({rpc:jest.fn().mockResolvedValue({data:null,error:Error(message)})});
 await expect(saveJobDecision("owner",input,{requestId:REQUEST,expectedClaimId:"old"})).rejects.toThrow(message);
});
test("缺回读 ID 不得假报保存",async()=>{
 (getDbClient as jest.Mock).mockResolvedValue({rpc:jest.fn().mockResolvedValue({data:null,error:null})});
 await expect(saveJobDecision("owner",input,{requestId:REQUEST,expectedClaimId:null})).rejects.toThrow("不完整");
});
test("同链接的两批判断都保留，同批只回最新，坏行不冒充决定",async()=>{
 const chain:Record<string,any>={};
 for(const method of ["select","eq","neq","order","limit"])chain[method]=jest.fn(()=>chain);
 chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[
  {id:"new",value:input,updated_at:"2026-10-08T02:00:00Z"},
  {id:"old",value:input,updated_at:"2026-10-08T01:00:00Z"},
  {id:"other",value:{...input,batchRunId:REQUEST},updated_at:"2026-10-07T01:00:00Z"},
  {id:"bad",value:{},updated_at:"2026-10-07T01:00:00Z"},
 ],error:null}).then(resolve);
 (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>chain)});
 expect((await listJobDecisions("owner")).map(x=>x.claimId)).toEqual(["new","other"]);
 expect(chain.eq).toHaveBeenCalledWith("user_id","owner");
 expect(chain.neq).toHaveBeenCalledWith("status","withdrawn");
});
