/** Read-only. Node >=22.18 (native type stripping); never prints prompts, answers or user IDs. */
import { createClient } from "@supabase/supabase-js";
import { experienceMetrics } from "../evals/release-gate.ts";
import { requestMetrics } from "../evals/request-metrics.ts";

const days = Number(process.env.REPORT_DAYS || 7);
if (!Number.isInteger(days) || days < 1 || days > 90) throw Error("REPORT_DAYS must be 1–90");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error("Missing database configuration; no query issued");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(20000) }) } });
const since = new Date(Date.now() - days * 86400000).toISOString();
const excluded = new Set([process.env.REPORT_EXCLUDE_USER_IDS, process.env.ANALYTICS_INTERNAL_USER_IDS]
  .filter(Boolean).join(",").split(",").map(s => s.trim()).filter(Boolean));
const groups = new Map();
let scanned = 0, excludedRows = 0, finished = false;
for (let start = 0; start < 100000; start += 1000) {
  const { data, error } = await db.from("coach_agent_turns")
    .select("id,user_id,answer,learning_trace,created_at").gte("created_at", since)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + 999);
  if (error) throw Error(`Read failed (${error.code || "network"}); no partial report accepted`);
  scanned += data.length;
  for (const row of data) {
    if (excluded.has(row.user_id)) { excludedRows++; continue; }
    const trace = row.learning_trace || {};
    const version = typeof trace.harness?.combined === "string" ? trace.harness.combined : "unversioned";
    if (!groups.has(version)) groups.set(version, []);
    groups.get(version).push({
      firstVisibleTextMs: typeof trace.timing?.firstTextMs === "number" ? trace.timing.firstTextMs : null,
      // Completed-turn storage cannot observe aborted/failed requests or actual adoption opportunities.
      interrupted: null, adopted: null,
      outputCharacters: Array.from(typeof row.answer === "string" ? row.answer : "").length,
    });
  }
  if (data.length < 1000) { finished = true; break; }
}
if (!finished) throw Error("100000-row limit reached; narrow REPORT_DAYS, no truncated report accepted");
const requestEvents=[];
let eventsFinished=false;
for(let start=0;start<100000;start+=1000){
  const {data,error}=await db.from("product_events").select("user_id,event_name,properties").gte("occurred_at",since)
    .in("event_name",["agent_answer_started","agent_answer_completed","agent_answer_failed","agent_answer_interrupted","agent_answer_adopted"])
    .order("occurred_at",{ascending:true}).order("id",{ascending:true}).range(start,start+999);
  if(error)throw Error("Request telemetry read failed; no partial report accepted");
  requestEvents.push(...data.filter(row=>!excluded.has(row.user_id)));
  if(data.length<1000){eventsFinished=true;break;}
}
if(!eventsFinished)throw Error("Request event limit reached; narrow report window");
console.log(JSON.stringify({ since, until: new Date().toISOString(), scanned, excludedRows,
  population: "persisted completed turns only; internal users excluded only when explicitly configured",
  requestTelemetry:requestEvents.length?requestMetrics(requestEvents):null,
  caveats: ["Server completion does not prove the user read or benefited from the answer", "Legacy turns lack request telemetry; note adoption measures only save-to-note, not general usefulness",
    "Do not infer causality between different fingerprints"],
  byVersion: [...groups].map(([version, rows]) => ({ version, ...experienceMetrics(rows) })),
}, null, 2));
