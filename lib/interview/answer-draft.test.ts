import {saveInterviewDraft,finishInterviewDraft} from "./answer-draft";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/db");
const scope={userId:"owner",sessionId:"session",questionId:"question",opportunityId:"job"};
test("same answer has deterministic identity, different user/question/text are isolated",async()=>{
 const upsert=jest.fn().mockResolvedValue({error:null});(getDbClient as jest.Mock).mockResolvedValue({from:()=>({upsert})});
 const first=await saveInterviewDraft(scope,"原文");expect(await saveInterviewDraft(scope,"原文")).toBe(first);
 expect(await saveInterviewDraft({...scope,userId:"other"},"原文")).not.toBe(first);
 expect(await saveInterviewDraft({...scope,questionId:"other"},"原文")).not.toBe(first);
 expect(await saveInterviewDraft(scope,"修改")).not.toBe(first);
 expect(upsert.mock.calls[0][0]).toMatchObject({content:"原文",captured_at:expect.any(String),metadata:{status:"pending"}});
 expect(upsert.mock.calls[0][0]).not.toHaveProperty("created_at");
});
test("a failed write stops before generation",async()=>{(getDbClient as jest.Mock).mockResolvedValue({from:()=>({upsert:async()=>({error:{code:"failed"}})})});await expect(saveInterviewDraft(scope,"原文")).rejects.toThrow("尚未开始分析");});
test("completion is constrained by user",async()=>{const q:any={update:jest.fn(()=>q),eq:jest.fn(()=>q),then:(resolve:any)=>resolve({error:null})};(getDbClient as jest.Mock).mockResolvedValue({from:()=>q});await finishInterviewDraft(scope,"原文");expect(q.eq).toHaveBeenCalledWith("user_id","owner");});
