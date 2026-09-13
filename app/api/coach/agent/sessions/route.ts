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
