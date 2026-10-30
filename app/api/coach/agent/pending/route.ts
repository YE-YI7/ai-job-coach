import {createHash} from "node:crypto";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {readLearningSession} from "@/lib/coach-harness/learning-memory";
import { parseResumeReference, sameResumeReference, ResumeReferenceError, type ResumeReference } from '@/lib/opportunities/resume-reference';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store"};
type Draft={id:string;content:string;opportunity_id?:string|null;
 metadata:{kind:string;sessionId:string;requestId:string;status?:string;interactionMode?:"coaching"|"mock_interview";resumeReference?:ResumeReference}};

/** Free source storage, not a completed AI turn or a confirmed resume claim. */
async function handle(req:Request,method:"GET"|"POST"|"DELETE"){
 const user=await getCurrentUserFromRequest();
 if(!user)return Response.json({error:"请先登录"},{status:401,headers});
 let body;
 try{body=method==="GET"?Object.fromEntries(new URL(req.url).searchParams):await req.json();}
 catch{return Response.json({error:"请求格式错误"},{status:400,headers});}
 if(!uuid.test(body?.sessionId||"")||(method!=="GET"&&!uuid.test(body?.requestId||""))||
   (method==="POST"&&(typeof body?.text!=="string"||!body.text.trim()||body.text.length>4000||(body.interactionMode!==undefined&&!["coaching","mock_interview"].includes(body.interactionMode)))))
  return Response.json({error:"回答或会话格式无效"},{status:400,headers});
 try{
  const resumeReference=method==='POST'&&body.resumeReference!==undefined?parseResumeReference(body.resumeReference):undefined;
  const session=await readLearningSession(user.id,body.sessionId);
  if(!session)return Response.json({error:"会话无法访问"},{status:404,headers});
  const db=await getDbClient();if(!db)throw Error("database unavailable");
  const query=()=>db.from("coach_sources").select("id,content,opportunity_id,metadata").eq("user_id",user.id).eq("source_type","user_answer").eq("metadata->>kind","pending_answer").eq("metadata->>sessionId",body.sessionId);
  if(method==="GET"){
   const {data,error}=await query().order("captured_at",{ascending:false}).limit(20);if(error)throw error;
   const drafts=(data||[]) as Draft[];
   if(!drafts.length)return Response.json({ok:true,pending:null},{headers});
   const turns=await db.from("coach_agent_turns").select("request_id").eq("user_id",user.id).eq("session_id",body.sessionId).in("request_id",drafts.map(d=>d.id));
   if(turns.error)throw turns.error;
   const completed=new Set<string>((turns.data||[]).map((t:{request_id:string})=>t.request_id));
   // New submission supersedes the former retry; never resurrect an older failed draft.
   const latest=drafts[0];
   const draft=latest&&!completed.has(latest.id)&&latest.metadata.status!=="completed"?latest:null;
   return Response.json({ok:true,completedRequestIds:[...completed],pending:draft?{text:draft.content,sessionId:body.sessionId,requestId:draft.id,
     opportunityId:draft.opportunity_id??session.opportunity_id,...(draft.metadata.interactionMode?{interactionMode:draft.metadata.interactionMode}:{}),
     ...(draft.metadata.resumeReference?{resumeReference:draft.metadata.resumeReference}:{})}:null},{headers});
  }
  if(method==="DELETE"){
   // Keep a completion marker so cleanup cannot expose an older superseded draft.
   const {error}=await db.from("coach_sources").update({metadata:{kind:"pending_answer",sessionId:body.sessionId,requestId:body.requestId,status:"completed"}}).eq("id",body.requestId).eq("user_id",user.id).eq("source_type","user_answer").eq("metadata->>kind","pending_answer").eq("metadata->>sessionId",body.sessionId);
   if(error)throw error;return Response.json({ok:true},{headers});
  }
  if(session.status!=="active")return Response.json({error:"会话已归档，请新开辅导；原回答仍保留"},{status:409,headers});
  const opportunityId=body.opportunityId===undefined?session.opportunity_id:body.opportunityId;
  if(resumeReference&&resumeReference.opportunityId!==opportunityId)return Response.json({error:'引用属于另一份简历，请重新点选'},{status:400,headers});
  if(opportunityId!==null&&!uuid.test(opportunityId||""))return Response.json({error:"岗位无效"},{status:400,headers});
  if(opportunityId){const owned=await db.from("coach_opportunities").select("id").eq("id",opportunityId).eq("user_id",user.id).maybeSingle();if(owned.error||!owned.data)return Response.json({error:"岗位无法访问"},{status:owned.error?503:404,headers});}
  const same=await query().eq("id",body.requestId).maybeSingle();if(same.error)throw same.error;
  if(same.data){const matches=same.data.content===body.text&&(body.opportunityId===undefined||same.data.opportunity_id===opportunityId)
    &&sameResumeReference(same.data.metadata?.resumeReference,resumeReference);
    return Response.json(matches?{ok:true}:{error:"这次请求已有不同回答、岗位或引用，请保留原文后重新提交"},{status:matches?200:409,headers});}
  // Insert only: a colliding UUID can never overwrite another user's source.
  const {error}=await db.from("coach_sources").insert({id:body.requestId,user_id:user.id,opportunity_id:opportunityId,source_type:"user_answer",title:"待分析回答",content:body.text,
    content_hash:createHash("sha256").update(`${body.sessionId}:${body.requestId}:${body.text}`).digest("hex"),
    metadata:{kind:"pending_answer",sessionId:body.sessionId,requestId:body.requestId,
      ...(body.interactionMode?{interactionMode:body.interactionMode}:{}),...(resumeReference?{resumeReference}:{})}});
  if(error){
   if(error.code==="23505"){
    const replay=await query().eq("id",body.requestId).maybeSingle();
    if(!replay.error&&replay.data?.content===body.text&&(body.opportunityId===undefined||replay.data.opportunity_id===opportunityId)
      &&sameResumeReference(replay.data?.metadata?.resumeReference,resumeReference))return Response.json({ok:true},{headers});
    return Response.json({error:"请求标识冲突，请保留原文后重新提交"},{status:409,headers});
   }
   throw error;
  }
  return Response.json({ok:true},{status:201,headers});
 }catch(cause){return Response.json({error:cause instanceof ResumeReferenceError?cause.message:"回答暂未保存到云端，原文仍在输入框，请重试"},
   {status:cause instanceof ResumeReferenceError?cause.status:503,headers});}
}
export const GET=(req:Request)=>handle(req,"GET");
export const POST=(req:Request)=>handle(req,"POST");
export const DELETE=(req:Request)=>handle(req,"DELETE");
