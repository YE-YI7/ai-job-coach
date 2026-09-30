import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";
import { ensureCompanyResearch, readCompanyResearch } from "@/lib/coach-harness/research-runtime";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "请求格式不正确" }, { status: 400, headers }); }
  if (!uuid.test(body.opportunityId || "") || (body.retryId !== undefined && !uuid.test(body.retryId))) return Response.json({ error: "请选择岗位" }, { status: 400, headers });
  try {
    const job = (await listCockpitOpportunities(user.id)).find(j => j.id === body.opportunityId);
    if (!job) return Response.json({ error: "岗位不可访问" }, { status: 404, headers });
    if (job.workspaceType === "preparation") return Response.json({ status: "unavailable", note: "" }, { headers });
    const result = await ensureCompanyResearch(user.id, job, body.retryId);
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "调研暂不可用，JD 与简历仍可继续使用。" }, { status: 503, headers }); }
}
export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get("opportunityId");
  if (!id || !uuid.test(id)) return Response.json({ error: "请选择岗位" }, { status: 400, headers });
  try {
    const job = (await listCockpitOpportunities(user.id)).find(j => j.id === id);
    if (!job) return Response.json({ error: "岗位不可访问" }, { status: 404, headers });
    return Response.json({ result: await readCompanyResearch(user.id, job) }, { headers });
  } catch { return Response.json({ error: "调研读取失败" }, { status: 503, headers }); }
}
