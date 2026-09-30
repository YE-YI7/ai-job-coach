import { getCurrentUserFromRequest } from "@/lib/auth";
import { reserveOutreach } from "@/lib/coach-harness/engagement/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "请求格式不正确" }, { status: 400, headers }); }
  if (!/^[\da-f-]{36}$/i.test(body.opportunityId || "") || typeof body.userIsTyping !== "boolean") return Response.json({ error: "触达信号不完整" }, { status: 400, headers });
  try { return Response.json({ invitation: await reserveOutreach(user.id, body.opportunityId, body.userIsTyping) }, { headers }); }
  catch { return Response.json({ error: "暂无法核验触达条件，本次保持静默。" }, { status: 503, headers }); }
}
