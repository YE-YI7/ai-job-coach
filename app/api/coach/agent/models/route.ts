import {NextResponse} from "next/server";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {chatModelAccess} from "@/lib/coach-harness/chat-models";
import {catalogWithAvailability} from "@/lib/coach-harness/model-catalog";
export async function GET(){
 const user=await getCurrentUserFromRequest();
 if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 try{
  const access=await chatModelAccess(user.id);
  // `available`/`connected`/`defaultModel` are kept for backward compatibility
  // with the previous select-based client. `catalog` is additive: the enriched,
  // gateway-aware card data (name, vendor, tier, reference speedIndex, available)
  // consumed by the new ModelPicker. Tier + speedIndex are our reference
  // estimates, never official billing figures.
  return NextResponse.json({ok:true,...access,catalog:catalogWithAvailability(access.available),defaultModel:"deepseek-v4-flash",pricingUrl:"https://tokendance.space/models",pricingNote:"模型目录未提供计费单价；档位与速率为参考估算，非扣费倍率，请以 TokenPay 实时价格与账单为准"},{headers:{"Cache-Control":"private, no-store"}});
 }
 catch{return NextResponse.json({error:"暂时无法读取模型配置"},{status:503});}
}
