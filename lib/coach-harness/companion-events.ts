import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { analyticsCohort } from "@/lib/analytics-cohort";
import { buildProductEventWrite } from "@/lib/product-events";

export type CompanionEventName = "companion_goal_saved" | "companion_submission_saved" | "companion_feedback_saved" | "companion_feedback_failed" | "companion_task_marked" | "companion_step_presented";

export async function recordCompanionEvent(userId: string, name: CompanionEventName, properties: Record<string, string | number | boolean | null>) {
  if (process.env.NODE_ENV === "test" || !userId) return "skipped" as const;
  try {
    const db = await getDbClient();
    if (!db) return "unconfirmed" as const;
    const key = createHash("sha256").update(JSON.stringify([name, properties.plan_id || "", properties.submission_id || "", properties.version || "", properties.action || ""])).digest("hex").slice(0, 32);
    const write = buildProductEventWrite({
      userId,
      anonId: null,
      name,
      clientEventId: key,
      occurredAt: new Date().toISOString(),
      properties: { ...properties, account_cohort: analyticsCohort(userId, process.env.ANALYTICS_INTERNAL_USER_IDS) },
    });
    const { error } = await db.from("product_events").upsert(write.row, { onConflict: write.onConflict, ignoreDuplicates: true });
    return error ? "unconfirmed" as const : "recorded" as const;
  } catch {
    return "unconfirmed" as const;
  }
}
