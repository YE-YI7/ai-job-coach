import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(await readFile(join(scriptDir, "..", "data", "job-knowledge.seed.json"), "utf8"));
const payload = JSON.stringify(seeds).replaceAll("$knowledge$", "");

process.stdout.write(`
with payload as (
  select value as item from jsonb_array_elements($knowledge$${payload}$knowledge$::jsonb)
)
insert into public.job_knowledge_items (
  platform, source_kind, canonical_url, title, author, published_at, language,
  company, roles, stages, summary, key_points, interview_questions,
  rights_mode, quality_score, source_metadata, content_hash, last_verified_at, updated_at
)
select
  item->>'platform', item->>'source_kind', item->>'canonical_url', item->>'title',
  nullif(item->>'author', ''), nullif(item->>'published_at', '')::date,
  coalesce(item->>'language', 'zh-CN'), nullif(item->>'company', ''),
  array(select jsonb_array_elements_text(item->'roles')),
  array(select jsonb_array_elements_text(item->'stages')),
  item->>'summary',
  array(select jsonb_array_elements_text(item->'key_points')),
  array(select jsonb_array_elements_text(item->'interview_questions')),
  'summary_only',
  case item->>'platform' when 'nowcoder' then 78 when 'github' then 76 else 72 end,
  jsonb_build_object('curated', true, 'imported_at', now()),
  md5((item->>'canonical_url') || E'\\n' || (item->>'title') || E'\\n' || (item->>'summary')),
  now(), now()
from payload
on conflict (canonical_url) do update set
  platform = excluded.platform, source_kind = excluded.source_kind, title = excluded.title,
  author = excluded.author, published_at = excluded.published_at, language = excluded.language,
  company = excluded.company, roles = excluded.roles, stages = excluded.stages,
  summary = excluded.summary, key_points = excluded.key_points,
  interview_questions = excluded.interview_questions, quality_score = excluded.quality_score,
  source_metadata = excluded.source_metadata, content_hash = excluded.content_hash,
  is_active = true, last_verified_at = now(), updated_at = now();
`);
