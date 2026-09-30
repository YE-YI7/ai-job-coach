import { getDbClient } from "@/lib/db";
import { evaluateOutreachGate } from "./gate";

/** Persisted, owner-wide cadence. A browser refresh cannot reset frequency controls. */
export async function reserveOutreach(userId: string, opportunityId: string, userIsTyping: boolean, now = Date.now()) {
  if (userIsTyping) return null;
  const db = await getDbClient();
  if (!db) throw Error("Database unavailable");
  const [jobRead, turnsRead, eventsRead, stageRead] = await Promise.all([
    db.from("coach_opportunities").select("id,stage,created_at,updated_at,metadata").eq("user_id", userId).eq("id", opportunityId).maybeSingle(),
    db.from("coach_agent_turns").select("id,learning_trace").eq("user_id", userId).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(20),
    db.from("product_events").select("event_name,occurred_at,properties").eq("user_id", userId)
      .in("event_name", ["agent_outreach_reserved", "agent_answer_failed", "agent_answer_interrupted"])
      .gte("occurred_at", new Date(now - 24 * 60 * 60 * 1000).toISOString()).order("occurred_at", { ascending: false }).limit(200),
    db.from("product_events").select("occurred_at,properties").eq("user_id", userId).eq("event_name", "agent_stage_changed")
      .eq("properties->>opportunity_id", opportunityId).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if ([jobRead, turnsRead, eventsRead, stageRead].some(r => r.error)) throw Error("Outreach facts unavailable");
  const job = jobRead.data;
  if (!job || eventsRead.data?.length === 200) return null;
  const events = (eventsRead.data || []) as Array<{ event_name: string; occurred_at: string }>;
  const outreach = events.filter(e => e.event_name === "agent_outreach_reserved");
  const bad = events.find(e => e.event_name !== "agent_outreach_reserved");
  const day = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Initial stage time is reliable only if the row has never been updated.
  const stageEnteredAt = stageRead.data?.occurred_at || job.metadata?.stageEnteredAt
    || (job.created_at === job.updated_at ? job.created_at : null);
  const decision = evaluateOutreachGate({ now, stage: job.stage, stageEnteredAt,
    userTurnCount: (turnsRead.data || []).filter((t: { learning_trace?: { proactive?: boolean } }) => !t.learning_trace?.proactive).length,
    outreachSentThisTurn: 0, outreachTodayCount: outreach.filter(e => new Date(Date.parse(e.occurred_at) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === day).length,
    lastOutreachAt: outreach[0]?.occurred_at || null, lastBadAnswerAt: bad?.occurred_at || null, userIsTyping });
  if (!decision.allowed) return null;
  const id = `outreach_${day}`;
  // CAS on one owner-wide cadence row also closes the concurrent midnight race:
  // unique per-day keys alone cannot enforce a rolling 24-hour interval.
  const cadence = await db.from("product_events").select("id,occurred_at").eq("user_id", userId).eq("client_event_id", "outreach_cadence").maybeSingle();
  if (cadence.error) throw cadence.error;
  const timestamp = new Date(now).toISOString();
  if (cadence.data && now - Date.parse(cadence.data.occurred_at) < 24 * 60 * 60 * 1000) return null;
  const lock = cadence.data
    ? await db.from("product_events").update({ occurred_at: timestamp }).eq("user_id", userId).eq("id", cadence.data.id).eq("occurred_at", cadence.data.occurred_at).select("id")
    : await db.from("product_events").upsert({ user_id: userId, client_event_id: "outreach_cadence", event_name: "agent_outreach_cadence", occurred_at: timestamp, properties: {} }, { onConflict: "user_id,client_event_id", ignoreDuplicates: true }).select("id");
  if (lock.error) throw lock.error;
  if (!lock.data?.length) return null;
  const { data, error } = await db.from("product_events").upsert({ user_id: userId, event_name: "agent_outreach_reserved", client_event_id: id,
    occurred_at: new Date(now).toISOString(), properties: { opportunity_id: opportunityId, stalled_days: decision.stalledDays } },
    { onConflict: "user_id,client_event_id", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  if (!data?.length) return null; // Another tab won the atomic daily reservation.
  return { id, title: "推进当前岗位", text: "这一步已经停留几天了。你现在卡在材料、准备，还是不知道下一步？我可以带你先完成一个小动作。",
    prompt: "请结合当前岗位已保存的阶段、简历和最近操作，先给我一个能马上完成的小动作；如果缺少关键信息，只问一个具体问题。不改写岗位状态，不编造经历。" };
}
