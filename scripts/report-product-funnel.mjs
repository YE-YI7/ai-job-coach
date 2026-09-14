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

// Explicit account exclusions: do not infer testers from private prompts or nicknames.
const excludedUsers = new Set((process.env.REPORT_EXCLUDE_USER_IDS || "").split(",").map(id=>id.trim()).filter(Boolean));
const {data:registeredUsers,error:usersError}=await db.from("users").select("id");
if(usersError)throw usersError;
const existingUsers=new Set((registeredUsers||[]).map(user=>user.id));
const rawEvents=data||[];
const events = rawEvents.filter(event=>existingUsers.has(event.user_id)&&!excludedUsers.has(event.user_id)&&event.properties?.is_test!==true);
const byUser = new Map();
const byEvent = {};
for (const event of events) {
  byEvent[event.event_name] = (byEvent[event.event_name] || 0) + 1;
  const list = byUser.get(event.user_id) || [];
  list.push(event);
  byUser.set(event.user_id, list);
}

const activationEvents = new Set([
  "material_intake_completed",
  "today_action_completed",
  "resume_generation_completed",
  "mock_interview_started",
  "interview_practice_saved",
  "interview_review_completed",
]);
const executionEvents = new Set([
  "today_action_completed",
  "evidence_confirmed",
  "resume_generation_completed",
  "mock_interview_started",
  "interview_practice_saved",
  "interview_review_completed",
]);
let activated24h = 0;
let completedLoop = 0;
let retainedD3 = 0;
let retainedD7 = 0;
const sourceUsers = new Map();
for (const userEvents of byUser.values()) {
  const first = new Date(userEvents[0].occurred_at).getTime();
  const source = userEvents.find((event) => event.properties?.source)?.properties?.source || "direct";
  const sourceEntry = sourceUsers.get(source) || { users: 0, viewed: 0, started: 0, material_ready: 0, executed: 0 };
  sourceEntry.users += 1;
  const names = new Set(userEvents.map((event) => event.event_name));
  const activated = userEvents.some((event) => activationEvents.has(event.event_name) && new Date(event.occurred_at).getTime() - first <= 86_400_000);
  const executed = [...names].some((name) => executionEvents.has(name));
  if (activated) activated24h += 1;
  if (names.has("material_intake_completed") && executed) completedLoop += 1;
  if (userEvents.some((event) => new Date(event.occurred_at).getTime() - first >= 3 * 86_400_000)) retainedD3 += 1;
  if (userEvents.some((event) => new Date(event.occurred_at).getTime() - first >= 7 * 86_400_000)) retainedD7 += 1;
  if (names.has("cockpit_viewed")) sourceEntry.viewed += 1;
  if (names.has("material_intake_started")) sourceEntry.started += 1;
  if (names.has("material_intake_completed")) sourceEntry.material_ready += 1;
  if (executed) sourceEntry.executed += 1;
  sourceUsers.set(source, sourceEntry);
}

const users = byUser.size;
const funnel = {
  viewed: [...byUser.values()].filter((items) => items.some((event) => event.event_name === "cockpit_viewed")).length,
  intake_started: [...byUser.values()].filter((items) => items.some((event) => event.event_name === "material_intake_started")).length,
  material_ready: [...byUser.values()].filter((items) => items.some((event) => event.event_name === "material_intake_completed")).length,
  executed: [...byUser.values()].filter((items) => items.some((event) => executionEvents.has(event.event_name))).length,
};
const rate = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(3)) : 0;
const bySource = Object.fromEntries([...sourceUsers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, item]) => [source, {
  ...item,
  start_rate: rate(item.started, item.viewed),
  material_completion_rate: rate(item.material_ready, item.started),
  execution_rate: rate(item.executed, item.material_ready),
}]));
const decisions = users === 0
  ? ["还没有真实内测数据：先招募首批 10 人，不投放广告。"]
  : [
      funnel.intake_started < funnel.viewed * 0.6 ? "首要阻断在材料入口：访谈未开始导入的用户。" : null,
      funnel.material_ready < funnel.intake_started * 0.7 ? "首要阻断在材料处理：检查解析失败、等待时间和信任提示。" : null,
      funnel.executed < funnel.material_ready * 0.6 ? "首要阻断在建议执行：检查导师建议是否可信、可操作。" : null,
      activated24h >= 8 && completedLoop >= 5 ? "观察到较多材料和操作事件；仍需核验实际成果及用户访谈，不据点击量签收实用性。" : null,
    ].filter(Boolean);
console.log(JSON.stringify({
  excluded_events: rawEvents.length-events.length,
  explicit_excluded_accounts: excludedUsers.size,
  data_caveat: "未标记的内部测试仍可能混入；计数不是严格顺序漏斗，不能据此宣称教学效果或上线成功。",
  window_days: days,
  since,
  users,
  events: events.length,
  activation_24h: { users: activated24h, rate: users ? Number((activated24h / users).toFixed(3)) : 0, target: 0.8 },
  material_and_execution_observed: { users: completedLoop, rate: users ? Number((completedLoop / users).toFixed(3)) : 0, caveat:"仅观察到材料和操作事件，不证明成果闭环" },
  return_after_3_days: { users: retainedD3, caveat:"窗口内首次观察事件至少3天后再次出现，不是严格D3留存率" },
  return_after_7_days: { users: retainedD7, caveat:"窗口内首次观察事件至少7天后再次出现，不是严格D7留存率" },
  funnel: {
    ...funnel,
    view_to_start: rate(funnel.intake_started, funnel.viewed),
    start_to_material: rate(funnel.material_ready, funnel.intake_started),
    material_to_execution: rate(funnel.executed, funnel.material_ready),
  },
  by_event: byEvent,
  by_source: bySource,
  decisions,
}, null, 2));
