import {getConfirmedInterviewClaims,getContextBundleForUser} from "./repository";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/db");
const jobId="11111111-1111-4111-8111-111111111111";
function chain(data:unknown){
 const q:Record<string,jest.Mock>={};
 for(const method of ["select","eq","is","or","order","in"])q[method]=jest.fn(()=>q);
 q.limit=jest.fn(async()=>({data,error:null}));
 q.maybeSingle=jest.fn(async()=>({data,error:null}));
 q.abortSignal=jest.fn(async()=>({data,error:null}));
 return q;
}
test("interview facts require current owner and current-job/global scope",async()=>{
 const q=chain([{id:"fact",entity_type:"experience",entity_key:"key",claim_type:"resume_source",display_text:"没有独立AI项目经历。",status:"confirmed",source_kind:"user_statement",verification_level:"user_confirmed"}]);
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 const claims=await getConfirmedInterviewClaims("owner",jobId);
 expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.eq).toHaveBeenCalledWith("status","confirmed");
 expect(q.or).toHaveBeenCalledWith(`opportunity_id.is.null,opportunity_id.eq.${jobId}`);expect(claims[0].displayText).toBe("没有独立AI项目经历。");
});
test("start can read beyond300 facts through complete owner-scoped pages without slicing",async()=>{
 const rows=Array.from({length:333},(_,i)=>({id:`fact-${i}`,entity_type:"project",entity_key:`project-${i}`,
  claim_type:"experience",display_text:`第${i}条真实原句`,source_excerpt:`原文${i}`,status:"confirmed",
  source_kind:"user_statement",verification_level:"user_confirmed"}));
 const pages:ReturnType<typeof chain>[]=[];
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>{
  const q=chain([]);q.range=jest.fn(async(from:number,to:number)=>({data:rows.slice(from,to+1),error:null}));
  pages.push(q);return q;
 }});
 const result=await getConfirmedInterviewClaims("owner",jobId,{complete:true});
 expect(result).toHaveLength(333);
 expect(result.map(c=>c.displayText)).toEqual(rows.map(c=>c.display_text));
 expect(pages).toHaveLength(2);
 for(const q of pages){
  expect(q.eq).toHaveBeenCalledWith("user_id","owner");
  expect(q.eq).toHaveBeenCalledWith("status","confirmed");
  expect(q.or).toHaveBeenCalledWith(`opportunity_id.is.null,opportunity_id.eq.${jobId}`);
 }
});
test("complete archive resource guard fails instead of returning a partial2000-fact archive",async()=>{
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>{
  const q=chain([]);q.range=jest.fn(async(from:number)=>({data:Array.from({length:200},(_,i)=>({id:`fact-${from+i}`})),error:null}));
  return q;
 }});
 await expect(getConfirmedInterviewClaims("owner",jobId,{complete:true})).rejects.toThrow("原事实均已保留");
});
test("resume beyond former 6000-character boundary remains intact in selected context",async()=>{
 const resume="参与用户访谈。\n".repeat(800)+"末尾事实：没有AI交付经验。";
 const job=chain({id:jobId,company:"测试公司",role:"产品经理",stage:"evaluating",jd_text:"负责需求分析",jd_version:1,metadata:{resumeText:resume}}),empty=chain([]);
 (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>table==="coach_opportunities"?job:empty});
 const context=await getContextBundleForUser({userId:"owner",opportunityId:jobId,task:"mock_interview",currentInput:"开始练习",knowledgeLimit:0,budget:{maxInputTokens:20_000},claimSelection:"all_required"});
 expect(context.attachments.find(item=>item.id==="resume-text")?.text).toBe(resume);
 expect(context.selection.included).toEqual(expect.arrayContaining([expect.objectContaining({kind:"attachment",refId:"resume-text"})]));
});
