import { getCurrentUserFromRequest } from "@/lib/auth";
import { getWatchaPayAccess, WatchaPayError } from "@/lib/watcha-pay";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** Read-only entitlement check; never credits or consumes quota. */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ ok: false, error: "请先登录" }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "capability") ||
    !["chat", "resume", "interview"].includes(body.capability)) {
    return Response.json({ ok: false, error: "请选择有效的产品能力" }, { status: 400, headers });
  }
  try {
    const account = await getWatchaPayAccess(user.id, body.capability);
    return Response.json({ ok: true, account }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: "支付服务暂不可用，请稍后重试", code: error instanceof WatchaPayError ? error.code : "internal_error" },
      { status: error instanceof WatchaPayError ? error.status : 503, headers });
  }
}
