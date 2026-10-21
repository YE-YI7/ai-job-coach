import "server-only";
import { getDbClient } from "@/lib/db";
import {
  analyticsInternalIds,
  analyticsWindow,
  buildAnalytics,
  type AnalyticsUser,
  type AnalyticsEvent,
} from "./admin-analytics";
import { redactEval } from "./coach-harness/eval-scope";
import { applyResumeChanges } from "./coach-harness/application-quality";
import type { ResumeChange } from "./opportunities/types";

type Db = NonNullable<Awaited<ReturnType<typeof getDbClient>>>;
const PAGE = 1000;
/** Stop rather than silently publish biased totals if a range outgrows this bounded reader. */
export async function readAnalyticsRows(
  db: Db,
  table: string,
  fields: string,
  start: string | null,
  end: string,
  cap: number,
) {
  const all = [];
  for (let offset = 0; offset <= cap; offset += PAGE) {
    let q = db
      .from(table)
      .select(fields)
      .lt("created_at", end)
      .order("created_at")
      .order("id")
      .range(offset, Math.min(offset + PAGE - 1, cap));
    if (start) q = q.gte("created_at", start);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data || []));
    if (all.length > cap) throw new Error("analytics_capacity");
    if (!data || data.length < PAGE) break;
  }
  return all;
}
export async function readAnalyticsSummary(db: Db, days: number) {
  const window = analyticsWindow(days);
  const [users, events] = await Promise.all([
    readAnalyticsRows(
      db,
      "users",
      "id,provider,created_at,last_active",
      null,
      window.end,
      10000,
    ),
    readAnalyticsRows(
      db,
      "product_events",
      "id,user_id,event_identity,event_name,created_at,source:properties->>source,page:properties->>page,host:properties->>host,environment:properties->>environment,qa:properties->>qa,is_test:properties->>is_test,account_cohort:properties->>account_cohort",
      window.start,
      window.end,
      20000,
    ),
  ]);
  return buildAnalytics(
    users as AnalyticsUser[],
    events as AnalyticsEvent[],
    window,
    analyticsInternalIds(process.env.ANALYTICS_INTERNAL_USER_IDS),
  );
}
const safeText = (v: unknown, max = 60000) =>
  typeof v === "string"
    ? String(redactEval(v.slice(0, max)))
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[邮箱已遮蔽]")
        .replace(/(?:\+?86[- ]?)?1[3-9]\d{9}/g, "[手机号已遮蔽]")
    : "";
export const DETAIL_KINDS = [
  "turns",
  "resumeChat",
  "legacyChat",
  "opportunities",
  "material",
] as const;
export type AnalyticsDetailKind = (typeof DETAIL_KINDS)[number];
export async function readAnalyticsDetail(
  db: Db,
  userId: string,
  kind: AnalyticsDetailKind,
  offset: number,
  opportunityId: string | null,
) {
  const owner = await db
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data) return null;
  const specs = {
    turns: [
      "coach_agent_turns",
      "id,question,answer,opportunity_id,session_id,created_at",
      "created_at",
    ],
    resumeChat: [
      "coach_resume_tasks",
      "id,opportunity_id,state,question,answers,conversation,updated_at",
      "updated_at",
    ],
    legacyChat: [
      "conversation_messages",
      "id,role,content,session_id,stage,created_at",
      "created_at",
    ],
    opportunities: [
      "coach_opportunities",
      "id,company,role,stage,status,created_at,updated_at",
      "created_at",
    ],
    material: [
      "coach_opportunities",
      "id,company,role,jd_text,updated_at,resume:metadata->>resumeText,changes:metadata->resumeChanges",
      "created_at",
    ],
  } as const;
  const [table, fields, order] = specs[kind];
  let q = db.from(table).select(fields).eq("user_id", userId);
  if (opportunityId)
    q = q.eq(
      kind === "material" || kind === "opportunities" ? "id" : "opportunity_id",
      opportunityId,
    );
  const { data, error } = await q
    .order(order, { ascending: false })
    .order("id")
    .range(offset, offset + 20);
  if (error) throw error;
  let remaining = 300000,
    truncatedFields = 0;
  const text = (v: unknown, max = 60000) => {
    const limit = Math.min(max, remaining);
    if (typeof v === "string" && v.length > limit) truncatedFields++;
    const result = safeText(v, limit);
    remaining = Math.max(0, remaining - result.length);
    return result;
  };
  const rows = (data || []).slice(0, 20).map((r: Record<string, unknown>) => {
    const base = {
      id: r.id,
      opportunityId: r.opportunity_id ?? null,
      createdAt: r.created_at ?? r.updated_at,
    };
    if (kind === "turns")
      return {
        ...base,
        sessionId: r.session_id,
        question: text(r.question),
        answer: text(r.answer),
      };
    if (kind === "legacyChat")
      return {
        ...base,
        sessionId: r.session_id,
        role: r.role,
        content: text(r.content),
        stage: r.stage,
      };
    if (kind === "resumeChat")
      return {
        ...base,
        state: r.state,
        question: text(
          (r.question as Record<string, unknown> | null)?.question,
        ),
        answers: (Array.isArray(r.answers) ? r.answers.slice(-100) : []).map(
          (a) => ({
            question: text(a?.question),
            answer: text(a?.answer),
            savedAt: a?.savedAt,
          }),
        ),
        conversation: (Array.isArray(r.conversation)
          ? r.conversation.slice(-100)
          : []
        ).map((t) => ({
          id: t?.id,
          message: text(t?.message),
          reply: text(t?.reply),
          status: t?.status,
          savedAt: t?.savedAt,
        })),
        truncated:
          (Array.isArray(r.conversation) && r.conversation.length > 100) ||
          (Array.isArray(r.answers) && r.answers.length > 100),
      };
    const job = {
      ...base,
      company: text(r.company, 250),
      role: text(r.role, 250),
      stage: r.stage,
      status: r.status,
      updatedAt: r.updated_at,
    };
    if (kind !== "material") return job;
    const source = typeof r.resume === "string" ? r.resume : "";
    const changes = (Array.isArray(r.changes) ? r.changes : [])
      .filter(
        (c) => c && typeof c.before === "string" && typeof c.after === "string",
      )
      .slice(0, 200) as ResumeChange[];
    const working = applyResumeChanges(source, changes);
    return {
      ...job,
      jd: text(r.jd_text),
      sourceResume: text(source),
      workingResume: text(working.text),
      replacementIssues: working.findings.length,
      changeCount: changes.length,
      truncated:
        source.length > 60000 ||
        working.text.length > 60000 ||
        String(r.jd_text || "").length > 60000,
    };
  });
  return {
    kind,
    rows,
    nextOffset: data?.length > 20 ? offset + 20 : null,
    textLimit: 60000,
    truncated: truncatedFields > 0,
  };
}
