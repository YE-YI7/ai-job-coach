import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const days = Math.max(1, Math.min(90, Number(process.argv[2] || 14)));
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db
  .from("product_events")
  .select("user_id,event_name,occurred_at,properties")
  .gte("occurred_at", since)
  .order("occurred_at", { ascending: true })
  .limit(10_000);
if (error) throw error;

const events = data || [];
const byUser = new Map();
const byEvent = {};
const bySource = {};
for (const event of events) {
  byEvent[event.event_name] = (byEvent[event.event_name] || 0) + 1;
  const source = event.properties?.source || "direct";
  bySource[source] = (bySource[source] || 0) + 1;
  const list = byUser.get(event.user_id) || [];
  list.push(event);
  byUser.set(event.user_id, list);
}

const valueEvents = new Set([
  "material_intake_completed",
  "today_action_completed",
  "resume_generation_completed",
  "mock_interview_started",
  "interview_practice_saved",
  "interview_review_saved",
]);
let activated24h = 0;
let completedLoop = 0;
let retainedD3 = 0;
let retainedD7 = 0;
for (const userEvents of byUser.values()) {
  const first = new Date(userEvents[0].occurred_at).getTime();
  if (userEvents.some((event) => valueEvents.has(event.event_name) && new Date(event.occurred_at).getTime() - first <= 86_400_000)) activated24h += 1;
  const names = new Set(userEvents.map((event) => event.event_name));
  if (names.has("material_intake_completed") && [...names].some((name) => valueEvents.has(name) && name !== "material_intake_completed")) completedLoop += 1;
  if (userEvents.some((event) => new Date(event.occurred_at).getTime() - first >= 3 * 86_400_000)) retainedD3 += 1;
  if (userEvents.some((event) => new Date(event.occurred_at).getTime() - first >= 7 * 86_400_000)) retainedD7 += 1;
}

const users = byUser.size;
console.log(JSON.stringify({
  window_days: days,
  since,
  users,
  events: events.length,
  activation_24h: { users: activated24h, rate: users ? Number((activated24h / users).toFixed(3)) : 0, target: 0.8 },
  completed_loop: { users: completedLoop, rate: users ? Number((completedLoop / users).toFixed(3)) : 0, target_users: 5 },
  retained_d3: { users: retainedD3, rate: users ? Number((retainedD3 / users).toFixed(3)) : 0 },
  retained_d7: { users: retainedD7, rate: users ? Number((retainedD7 / users).toFixed(3)) : 0 },
  by_event: byEvent,
  by_source: bySource,
}, null, 2));
