import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {readLearningMemory} from "@/lib/coach-harness/learning-memory";
export async function GET(req:Request){
 const user=await getCurrentUserFromRequest();if(!user)return Response.json({error:"请先登录"},{status:401});
 const id=new URL(req.url).searchParams.get("opportunityId");if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:"岗位无效"},{status:400});
 try{
 const db=await getDbClient();if(!db)throw Error("数据库不可用");
 const {data,error}=await db.from("coach_memory_documents").select("content,created_at").eq("user_id",user.id).eq("path","profile/overview.md").order("created_at",{ascending:false}).limit(1);
 if(error)throw error;
 const learning=await readLearningMemory(user.id,id);
 const content=`# 益职私有学习档案\n\n## profile/overview.md\n${data?.[0]?.content||"尚未生成背景摘要"}\n\n## learning/\n${learning||"尚无归档学习"}\n\n此导出包含最近三次相关学习的摘要；原始事实与全部会话仍保存在账户中。`;
 return new Response(content,{headers:{"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":"attachment; filename=yi-zhi-learning-memory.md","Cache-Control":"private, no-store"}});
 }catch{return Response.json({error:"档案暂时无法读取，请重试"},{status:503});}
}
