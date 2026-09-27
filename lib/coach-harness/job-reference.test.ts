import { matchJobReference, resolveSavedJobReference } from "./job-reference";
import { getDbClient } from "@/lib/db";
jest.mock("@/lib/db");
const jobs = [{id:"kimi",company:"Kimi",role:"Agent 协作产品经理"},{id:"other",company:"其他公司",role:"产品经理"}];
test("resolves the reported company and role including spaces",()=>{
 expect(matchJobReference("那拆 Kimi 的 Agent 协作产品经理吧",jobs).job?.id).toBe("kimi");
});
test("does not choose one of multiple company jobs",()=>{
 expect(matchJobReference("拆Kimi岗位",[...jobs,{id:"k2",company:"Kimi",role:"工程师"}]).ambiguous).toHaveLength(2);
});
test("ordinary learning question does not switch jobs",()=>{
 expect(matchJobReference("教我怎么拆JD",jobs).job).toBeNull();
});
test("only queries active jobs belonging to authenticated owner",async()=>{
 const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:jobs})};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 expect((await resolveSavedJobReference("owner","拆 Kimi 岗位")).job?.id).toBe("kimi");
 expect(q.eq).toHaveBeenCalledWith("user_id","owner");
 expect(q.eq).toHaveBeenCalledWith("status","active");
 expect(q.select).toHaveBeenCalledWith("id,company,role");
});
