import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const headers={"Cache-Control":"private, no-store"};

/** Always read the saved source-bound revision, not a fresh copy of the AI draft. */
export async function GET(request:Request) {
  const user=await getCurrentUserFromRequest();
  if(!user)return Response.json({error:"请先登录"},{status:401,headers});
  const turnId=new URL(request.url).searchParams.get("turnId");
  if(!turnId||!uuid.test(turnId))return Response.json({error:"成果来源无效"},{status:400,headers});
  const db=await getDbClient();
  if(!db)return Response.json({error:"数据库不可用"},{status:503,headers});
  const {data,error}=await db.from("coach_learning_sessions")
    .select("id,title,version,outcome,summary").eq("user_id",user.id).eq("source_turn_id",turnId).maybeSingle();
  return Response.json(error?{error:"已保存成果读取失败，请重试；没有覆盖原记录"}:{ok:true,saved:data??null}, {status:error?503:200,headers});
}

export async function POST(request:Request) {
  const user=await getCurrentUserFromRequest();
  if(!user)return Response.json({error:"请先登录"},{status:401,headers});
  let body;
  try{body=await request.json();}catch{return Response.json({error:"请求格式错误"},{status:400,headers});}
  if(!uuid.test(body?.turnId||"") || !uuid.test(body?.requestId||"") ||
    typeof body?.answerDraft!=="string" || !body.answerDraft.trim() || body.answerDraft.length>6000 ||
    !Number.isInteger(body.expectedVersion) || body.expectedVersion<0)
    return Response.json({error:"成果格式无效，请保留草稿后重试"},{status:400,headers});
  const db=await getDbClient();
  if(!db)return Response.json({error:"数据库不可用"},{status:503,headers});
  // Server derives goal, evidence and observedStatus from the owner's source turn.
  const {data,error}=await db.rpc("save_coach_outcome",{
    p_user_id:user.id,p_turn_id:body.turnId,p_answer:body.answerDraft,
    p_expected_version:body.expectedVersion,p_request_id:body.requestId,
  });
  if(error){
    const message=error.message||"";
    const conflict=/outcome_version_conflict|request_reused/.test(message);
    const missing=/source_not_found|source_has_no_outcome/.test(message);
    return Response.json({error:conflict?"笔记已被另一处更新，请重新读取；你的草稿仍保留":missing?"这条成果来源无法访问，草稿尚未保存":"成果没有保存，草稿仍在，可以重试"},{status:conflict?409:missing?404:503,headers});
  }
  if(!data?.id||!data.outcome)return Response.json({error:"保存结果未确认，请保留草稿后重试"},{status:503,headers});
  return Response.json({ok:true,saved:data},{headers});
}
