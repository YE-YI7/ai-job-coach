import { getDbClient } from "@/lib/db";
export type ChatEvent = "started" | "completed" | "failed" | "interrupted" | "adopted";
/** Request-level denominator includes failures; no question, answer, resume, or JD is stored here. */
export async function recordChatRequest(userId: string, requestId: string, event: ChatEvent,
  properties: { opportunity_id?: string | null; harness_version?: string; first_text_ms?: number | null; duration_ms?: number; turn_id?: string } = {}) {
  if (!/^[\da-f-]{36}$/i.test(requestId)) return;
  try {
    const db = await getDbClient(); if (!db) return;
    const { error } = await db.from("product_events").upsert({ user_id: userId,
      event_name: `agent_answer_${event}`, client_event_id: `chat_${event}_${requestId}`, occurred_at: new Date().toISOString(),
      properties: { request_id: requestId, telemetry_version: "request-v1", ...properties,
        opportunity_id: /^[\da-f-]{36}$/i.test(properties.opportunity_id || "") ? properties.opportunity_id : null } },
      { onConflict: "user_id,client_event_id", ignoreDuplicates: true });
    if (error) console.error("Chat telemetry unavailable", event);
  } catch { console.error("Chat telemetry unavailable", event); }
}
