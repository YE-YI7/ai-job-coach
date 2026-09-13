import {NextResponse} from "next/server";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {chatModelAccess} from "@/lib/coach-harness/chat-models";
export async function GET(){
 const user=await getCurrentUserFromRequest();
 if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 try{return NextResponse.json({ok:true,...await chatModelAccess(user.id),defaultModel:"deepseek-v4-flash",pricingUrl:"https://tokendance.space/models",pricingNote:"模型目录未提供计费单价，请以 TokenPay 实时价格为准"},{headers:{"Cache-Control":"private, no-store"}});}
 catch{return NextResponse.json({error:"暂时无法读取模型配置"},{status:503});}
}
