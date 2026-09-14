import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store"};
export async function GET(req:Request){
 const user=await getCurrentUserFromRequest();if(!user)return Response.json({error:"请先登录"},{status:401,headers});
 const id=new URL(req.url).searchParams.get("opportunityId");if(id&&!uuid.test(id))return Response.json({error:"岗位无效"},{status:400,headers});
 const db=await getDbClient();if(!db)return Response.json({error:"数据库不可用"},{status:503,headers});
 let q=db.from("coach_learning_sessions").select("id,title,status,summary,created_at,archived_at").eq("user_id",user.id);
 q=id?q.eq("opportunity_id",id):q.is("opportunity_id",null);
 const {data,error}=await q.order("created_at",{ascending:false}).limit(30);
 let legacy=db.from("coach_agent_turns").select("id").eq("user_id",user.id).is("session_id",null);
 legacy=id?legacy.eq("opportunity_id",id):legacy.is("opportunity_id",null);
 const {data:old,error:legacyError}=await legacy.limit(1);
 return Response.json(error||legacyError?{error:"无法读取学习记录"}:{ok:true,sessions:[...(data||[]),...(old?.length?[{id:"legacy",title:"旧版对话",status:"archived",summary:null}]:[])]},{status:error||legacyError?503:200,headers});
}
export async function POST(req:Request){
 const user=await getCurrentUserFromRequest();if(!user)return Response.json({error:"请先登录"},{status:401,headers});
 let b;try{b=await req.json();}catch{return Response.json({error:"请求格式错误"},{status:400,headers});}
 const id=b?.opportunityId??null;
 if((id!==null&&(typeof id!=="string"||!uuid.test(id)))||typeof b?.title!=="string"||!b.title.trim()||b.title.length>200)return Response.json({error:"学习目标无效"},{status:400,headers});
 const db=await getDbClient();if(!db)return Response.json({error:"数据库不可用"},{status:503,headers});
 if(id){const {data,error}=await db.from("coach_opportunities").select("id").eq("id",id).eq("user_id",user.id).maybeSingle();if(error||!data)return Response.json({error:"岗位无法访问"},{status:error?503:404,headers});}
 const {data,error}=await db.from("coach_learning_sessions").insert({user_id:user.id,opportunity_id:id,title:b.title.trim()}).select("id,title,status").single();
 return Response.json(error?{error:"开课失败，请重试"}:{ok:true,session:data},{status:error?503:201,headers});
}

// Manual notes are free. Compare the previous summary to prevent a stale tab
// overwriting an edit or an AI archive; never accept a user_id from the client.
export async function PATCH(req:Request){
 const user=await getCurrentUserFromRequest();if(!user)return Response.json({error:"请先登录"},{status:401,headers});
 let b;try{b=await req.json();}catch{return Response.json({error:"请求格式错误"},{status:400,headers});}
 if(!uuid.test(b?.sessionId||"")||typeof b?.summary!=="string"||b.summary.length>6000||!(b.expectedSummary===null||typeof b.expectedSummary==="string"))return Response.json({error:"笔记格式无效（最多6000字）"},{status:400,headers});
 const db=await getDbClient();if(!db)return Response.json({error:"数据库不可用"},{status:503,headers});
 const {data:current,error:readError}=await db.from("coach_learning_sessions").select("version,summary").eq("id",b.sessionId).eq("user_id",user.id).maybeSingle();
 if(readError||!current)return Response.json({error:"无法读取这次学习"},{status:readError?503:404,headers});
 if((current.summary??null)!==b.expectedSummary)return Response.json({error:"笔记已更新，请重新打开学习记录后再修改；你的草稿仍保留"},{status:409,headers});
 const {data,error}=await db.from("coach_learning_sessions").update({summary:b.summary,version:current.version+1}).eq("id",b.sessionId).eq("user_id",user.id).eq("version",current.version).select("id").maybeSingle();
 return Response.json(error||!data?{error:"笔记未保存，请保留草稿后重试"}:{ok:true,summary:b.summary},{status:error?503:!data?409:200,headers});
}
