import { getCurrentUserFromRequest } from "@/lib/auth";
import { hasActiveTokenPayConnection } from "@/lib/tokenpay";
import { hostedStepModel } from "@/lib/hosted-model";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const tokenPay = await hasActiveTokenPayConnection(user.id);
    return Response.json({ provider: tokenPay ? "TokenDance / TokenPay（你连接的模型服务）" : hostedStepModel() ? "StepFun（阶跃星辰，站点模型）" : "DeepSeek（站点模型）" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "暂时无法确认模型服务，请稍后再提交" }, { status: 503 }); }
}
