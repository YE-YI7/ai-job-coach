import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";
import { fetchJobBoard, JOB_SOURCES, matchJobs } from "@/lib/jobs/discovery";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 30;
const readBoard = (source: typeof JOB_SOURCES[number]) => unstable_cache(
  () => fetchJobBoard(source), ["public-jobs-v1", source.board], { revalidate: 3600 },
)();

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return Response.json({error:"请先登录"}, {status:401});
  let profileId: unknown;
  try { profileId = (await request.json()).profileId; } catch { return Response.json({error:"请求格式不正确"},{status:400}); }
  if (typeof profileId !== "string" || !/^[\da-f-]{36}$/i.test(profileId)) return Response.json({error:"请选择基础简历"},{status:400});
  try {
    const profile = (await listCockpitOpportunities(user.id)).find(item => item.id === profileId && item.workspaceType === "preparation");
    if (!profile) return Response.json({error:"找不到这份基础简历"},{status:404});
    if (!profile.resumeText?.trim() || !profile.role?.trim()) return Response.json({error:"请先保存简历和求职方向"},{status:400});
    const results = await Promise.allSettled(JOB_SOURCES.map(readBoard));
    const available = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    const failedSources = JOB_SOURCES.filter((_,i) => results[i].status === "rejected").map(source => source.company);
    if (failedSources.length === JOB_SOURCES.length) return Response.json({error:"招聘来源暂时无法读取，请稍后重试。你的简历不受影响。"},{status:502});
    const jobs = matchJobs(available, {role:profile.role,location:profile.location || "",resume:profile.resumeText});
    return Response.json({jobs, failedSources, sources:JOB_SOURCES.map(source=>source.company),
      note:"仅覆盖 Meshy、Kong 的公开招聘板；按方向、城市和共同关键词初筛，不代表能力匹配或录用概率。远程岗位仍有地区限制。"},
      {headers:{"Cache-Control":"private, no-store"}});
  } catch { return Response.json({error:"读取简历失败，请重试"},{status:500}); }
}
