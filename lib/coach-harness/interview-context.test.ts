import {getConfirmedInterviewClaims,getContextBundleForUser} from "./repository";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/db");
const jobId="11111111-1111-4111-8111-111111111111";
function chain(data:unknown){const q:any={};for(const method of ["select","eq","is","or","order"])q[method]=jest.fn(()=>q);q.limit=jest.fn(async()=>({data,error:null}));q.maybeSingle=jest.fn(async()=>({data,error:null}));return q;}
test("interview facts require current owner and current-job/global scope",async()=>{
 const q=chain([{id:"fact",entity_type:"experience",entity_key:"key",claim_type:"resume_source",display_text:"没有独立AI项目经历。",status:"confirmed",source_kind:"user_statement",verification_level:"user_confirmed"}]);
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 const claims=await getConfirmedInterviewClaims("owner",jobId);
 expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.eq).toHaveBeenCalledWith("status","confirmed");
 expect(q.or).toHaveBeenCalledWith(`opportunity_id.is.null,opportunity_id.eq.${jobId}`);expect(claims[0].displayText).toBe("没有独立AI项目经历。");
});
test("resume beyond former 6000-character boundary remains intact in selected context",async()=>{
 const resume="参与用户访谈。\n".repeat(800)+"末尾事实：没有AI交付经验。";
 const job=chain({id:jobId,company:"测试公司",role:"产品经理",stage:"evaluating",jd_text:"负责需求分析",jd_version:1,metadata:{resumeText:resume}}),empty=chain([]);
 (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>table==="coach_opportunities"?job:empty});
 const context=await getContextBundleForUser({userId:"owner",opportunityId:jobId,task:"mock_interview",currentInput:"开始练习",knowledgeLimit:0,budget:{maxInputTokens:20_000},claimSelection:"all_required"});
 expect(context.attachments.find(item=>item.id==="resume-text")?.text).toBe(resume);
 expect(context.selection.included).toEqual(expect.arrayContaining([expect.objectContaining({kind:"attachment",refId:"resume-text"})]));
});
