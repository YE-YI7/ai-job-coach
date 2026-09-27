import { getDbClient } from "@/lib/db";

type JobReference = { id: string; company: string; role: string };
const normalize = (text: string) => text.toLowerCase().replace(/[\s·・的，,。！!？?]/g, "");

// Resolve only explicit names. Never infer a private job from public knowledge.
export function matchJobReference(message: string, jobs: JobReference[]) {
  const text = normalize(message);
  const companyMatches = jobs.filter(job => normalize(job.company).length >= 2 && text.includes(normalize(job.company)));
  const candidates = companyMatches.length ? companyMatches : jobs.filter(job => normalize(job.role).length >= 4 && text.includes(normalize(job.role)));
  const exact = candidates.filter(job => text.includes(normalize(job.role)));
  const matches = exact.length ? exact : candidates;
  return { job: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 ? matches : [] };
}

export async function resolveSavedJobReference(userId: string, message: string) {
  const db = await getDbClient();
  if (!db) throw new Error("读取已保存岗位失败，请重试");
  const { data, error } = await db.from("coach_opportunities")
    .select("id,company,role").eq("user_id", userId).eq("status", "active")
    .order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("读取已保存岗位失败，请重试");
  return matchJobReference(message, (data ?? []) as JobReference[]);
}
