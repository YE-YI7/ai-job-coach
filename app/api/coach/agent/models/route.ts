import {NextResponse} from "next/server";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {chatModelAccess} from "@/lib/coach-harness/chat-models";
import {catalogWithAvailability} from "@/lib/coach-harness/model-catalog";
import {getModelReferencePrices,MODEL_PRICING_URL} from "@/lib/coach-harness/model-pricing";
export async function GET(){
 const user=await getCurrentUserFromRequest();
 if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 try{
  const [access,prices]=await Promise.all([chatModelAccess(user.id),getModelReferencePrices()]);
  // `available`/`connected`/`defaultModel` are kept for backward compatibility
  // with the previous select-based client. `catalog` is additive: the enriched,
  // gateway-aware card data plus dated public tariff references. Speed alone
  // is an estimate. Neither field participates in billing or credit debits.
  return NextResponse.json({ok:true,...access,catalog:catalogWithAvailability(access.available,prices),defaultModel:"deepseek-v4-flash",pricingUrl:MODEL_PRICING_URL,pricingNote:"价格参考 TokenDance 公开价，单位为人民币/百万 tokens；缓存价只适用于命中部分，实际以账单为准。速度为相对估算，千问3.8 Max锚定0.7，越大越快，非扣费倍率。"},{headers:{"Cache-Control":"private, no-store"}});
 }
 catch{return NextResponse.json({error:"暂时无法读取模型配置"},{status:503});}
}
