import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const days = Math.max(1, Math.min(90, Number(process.argv[2] || 14)));
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function readAll(query) {
  const rows = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await query().range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
  throw new Error("Report exceeds 100,000 rows; narrow the window instead of reporting truncated counts");
}
const until = new Date().toISOString();
const data = await readAll(() => db
  .from("product_events")
  .select("id,user_id,event_name,occurred_at,properties")
  .gte("occurred_at", since)
  .lte("occurred_at", until)
  .order("occurred_at", { ascending: true })
  .order("id", { ascending: true }));

// Explicit account exclusions: do not infer testers from private prompts or nicknames.
const excludedUsers = new Set((process.env.REPORT_EXCLUDE_USER_IDS || "").split(",").map(id=>id.trim()).filter(Boolean));
const registeredUsers=await readAll(() => db.from("users").select("id").order("id"));
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
  "interview_practice_saved",
  "interview_review_completed",
]);
const executionEvents = new Set([
  "today_action_completed",
  "evidence_confirmed",
  "resume_generation_completed",
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
// Read persisted deliverables separately. A start/click/model success is not a result.
const snapshots = await readAll(() => db.from("coach_opportunity_snapshots")
  .select("id,user_id,opportunity_id,snapshot_type,frozen_at")
  .gte("frozen_at", since).lte("frozen_at", until).order("frozen_at").order("id"));
const eligibleSnapshots = snapshots.filter(row => existingUsers.has(row.user_id) && !excludedUsers.has(row.user_id));
const persistedOutcomes = Object.fromEntries(["base_resume", "submitted_resume", "interview_feedback", "outcome"].map(type => {
  const rows = eligibleSnapshots.filter(row => row.snapshot_type === type);
  return [type, { records: rows.length, accounts: new Set(rows.map(row => row.user_id)).size, opportunities: new Set(rows.map(row => `${row.user_id}:${row.opportunity_id}`)).size }];
}));
const savedResumeJourneys = eligibleSnapshots.filter(row => row.snapshot_type === "submitted_resume").filter(row => events.some(event => event.user_id === row.user_id && event.properties?.opportunity_id === row.opportunity_id && event.event_name === "resume_change_revalidated" && event.properties?.status === "ready" && new Date(event.occurred_at) <= new Date(row.frozen_at)));
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
const decisions = users < 20
  ? ["样本不足 20 个账号，不根据转化比例下结论；优先复现失败链路并访谈，结合持久化成果核验。"]
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
  until,
  persisted_outcomes: persistedOutcomes,
  checked_then_saved_resume_jobs: new Set(savedResumeJourneys.map(row => `${row.user_id}:${row.opportunity_id}`)).size,
  outcome_caveat: "快照计数代表云端产物保存，不代表投递成功或 PDF 下载；仅排除显式账号名单，未标记测试可能混入。同岗检查→保存要求窗口内可观察的先后事件，历史缺埋点不推断失败。",
  users,
  events: events.length,
  activity_24h_observed: { users: activated24h, rate: users ? Number((activated24h / users).toFixed(3)) : 0, caveat: "从窗口内首次事件计算，不是注册队列激活率" },
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
