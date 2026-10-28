import { getCurrentUserFromRequest } from "@/lib/auth";
import { readInterviewHistory, recordInterviewProgress } from "@/lib/interview/history-store";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) => Response.json(body,
  { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return reply({ ok: false, error: "请先登录" }, 401);
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("sessionId") || undefined;
  const opportunityId = params.get("opportunityId") || undefined;
  const query = params.get("q")?.trim() || undefined;
  const round = params.get("round") || undefined;
  const page = Number(params.get("page") || 1);
  if ([sessionId, opportunityId].some(id => id && !uuid.test(id)) || (query?.length || 0) > 80
    || (round?.length || 0) > 24 || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return reply({ ok: false, error: "筛选条件无效" }, 400);
  }
  try {
    const result = await readInterviewHistory(user.id, { sessionId, opportunityId, query, round, page });
    if (sessionId && !result.sessions.length) return reply({ ok: false, error: "面试记录不存在或无权访问" }, 404);
    return reply({ ok: true, ...result });
  } catch (error) {
    return reply({ ok: false, error: error instanceof Error ? error.message : "读取失败，请重试" }, 503);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return reply({ ok: false, error: "请先登录" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !uuid.test(body.sessionId || "") || !["setup", "seen", "end"].includes(body.action)
    || (body.action === "seen" && !uuid.test(body.questionId || ""))
    || (body.action === "setup" && (typeof body.roundLabel !== "string" || !body.roundLabel.trim() || body.roundLabel.length > 24))) {
    return reply({ ok: false, error: "面试进度无效" }, 400);
  }
  try {
    const ok = await recordInterviewProgress(user.id, body.sessionId, { action: body.action,
      ...(body.action === "seen" ? { questionId: body.questionId } : {}),
      ...(body.action === "setup" ? { roundLabel: body.roundLabel.trim() } : {}) });
    return ok ? reply({ ok: true, saved: true }) : reply({ ok: false, error: "面试或题目不可访问" }, 404);
  } catch {
    return reply({ ok: false, error: "面试进度未保存，请重试；已提交的回答不会被删除" }, 503);
  }
}
