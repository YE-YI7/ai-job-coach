import { getDbClient } from "@/lib/db";
import type { AgentKnowledgeItem, KnowledgePlatform } from "./types";

type KnowledgeRow = Record<string, unknown>;

function normalizedRoleFilter(role?: string | null) {
  const value = role?.trim() || "";
  const knownRoles = ["产品经理", "商业产品经理", "技术产品经理", "后端开发", "前端开发", "全栈开发", "软件工程师", "算法工程师", "Java开发"];
  return knownRoles.find((known) => value.includes(known)) || value || null;
}

function mapItem(row: KnowledgeRow): AgentKnowledgeItem {
  return {
    id: String(row.id),
    platform: String(row.platform) as AgentKnowledgeItem["platform"],
    sourceKind: String(row.source_kind) as AgentKnowledgeItem["sourceKind"],
    title: String(row.title),
    url: String(row.canonical_url),
    company: row.company ? String(row.company) : null,
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    stages: Array.isArray(row.stages) ? row.stages.map(String) : [],
    summary: String(row.summary),
    keyPoints: Array.isArray(row.key_points) ? row.key_points.map(String) : [],
    interviewQuestions: Array.isArray(row.interview_questions) ? row.interview_questions.map(String) : [],
    publishedAt: row.published_at ? String(row.published_at) : null,
    qualityScore: Number(row.quality_score || 0),
  };
}

export async function retrieveAgentKnowledge(input: {
  query?: string | null;
  role?: string | null;
  company?: string | null;
  platform?: KnowledgePlatform | null;
  limit?: number;
}): Promise<AgentKnowledgeItem[]> {
  const db = await getDbClient();
  if (!db) return [];

  const limit = Math.min(Math.max(input.limit || 8, 1), 20);
  const roleFilter = normalizedRoleFilter(input.role);
  const requests: Array<Promise<{ data: KnowledgeRow[] | null; error: unknown }>> = [];
  if (input.company?.trim()) {
    requests.push(db.rpc("search_job_knowledge", {
      query_text: null,
      role_filter: roleFilter,
      company_filter: input.company.trim(),
      platform_filter: input.platform || null,
      result_limit: limit,
    }));
  }
  const query = input.query?.trim() || input.role?.trim() || null;
  requests.push(db.rpc("search_job_knowledge", {
    query_text: query ? query.slice(0, 240) : null,
    role_filter: roleFilter,
    company_filter: null,
    platform_filter: input.platform || null,
    result_limit: limit,
  }));

  const settled = await Promise.all(requests);
  const rows: KnowledgeRow[] = [];
  for (const result of settled) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  const unique = new Map(rows.map((row) => [String(row.id), row]));
  return [...unique.values()].map(mapItem).slice(0, limit);
}
