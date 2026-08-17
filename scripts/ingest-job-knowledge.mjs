import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const seedPath = join(scriptDir, "..", "data", "job-knowledge.seed.json");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const seeds = JSON.parse(await readFile(seedPath, "utf8"));
const now = new Date().toISOString();
const rows = seeds.map((item) => ({
  ...item,
  rights_mode: "summary_only",
  quality_score: item.platform === "nowcoder" ? 78 : item.platform === "github" ? 76 : 72,
  content_hash: createHash("sha256")
    .update(`${item.canonical_url}\n${item.title}\n${item.summary}`)
    .digest("hex"),
  source_metadata: { curated: true, imported_at: now },
  last_verified_at: now,
  updated_at: now,
}));

const { error } = await client
  .from("job_knowledge_items")
  .upsert(rows, { onConflict: "canonical_url" });
if (error) throw error;

const counts = rows.reduce((map, row) => map.set(row.platform, (map.get(row.platform) || 0) + 1), new Map());
const runs = [...counts.entries()].map(([platform, count]) => ({
  platform,
  source_query: "curated public job-search and interview sources v1",
  status: "completed",
  discovered_count: count,
  stored_count: count,
  finished_at: now,
}));
runs.push({
  platform: "xiaohongshu",
  source_query: "求职 面经 岗位经历",
  status: "partial",
  discovered_count: 0,
  stored_count: 0,
  error_message: "公开搜索无法稳定访问原帖；只接受用户分享的公开链接，不绕过登录或平台限制。",
  finished_at: now,
});

const { error: runError } = await client.from("job_knowledge_sync_runs").insert(runs);
if (runError) throw runError;

console.log(`Stored ${rows.length} knowledge items across ${counts.size} public platforms.`);
