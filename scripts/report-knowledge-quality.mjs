import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const knowledge = JSON.parse(await readFile(join(rootDir, "data", "knowledge-documents.generated.json"), "utf8"));
const sources = JSON.parse(await readFile(join(rootDir, "data", "job-knowledge.seed.json"), "utf8"));
const evaluations = JSON.parse(await readFile(join(rootDir, "evals", "knowledge-retrieval.v1.json"), "utf8"));

const byPlatform = Object.fromEntries([...new Set(sources.map((item) => item.platform))].sort().map((platform) => [platform, sources.filter((item) => item.platform === platform).length]));
const byConfidence = Object.fromEntries(["low", "medium", "high"].map((confidence) => [confidence, knowledge.documents.filter((item) => item.confidence === confidence).length]));
const evidenceCounts = knowledge.documents.map((item) => item.evidence.length);
const report = {
  generated_at: `${knowledge.updated_at}T00:00:00.000Z`,
  current: {
    sources: sources.length,
    documents: knowledge.documents.length,
    companies: new Set(knowledge.documents.flatMap((item) => item.companies)).size,
    retrieval_evaluations: evaluations.length,
    documents_with_three_sources: evidenceCounts.filter((count) => count >= 3).length,
    three_source_ratio: knowledge.documents.length ? Number((evidenceCounts.filter((count) => count >= 3).length / knowledge.documents.length).toFixed(3)) : 0,
    by_platform: byPlatform,
    by_confidence: byConfidence,
  },
  practical_grade_target: {
    sources: 300,
    documents: 80,
    companies: 10,
    retrieval_evaluations: 100,
    three_source_ratio: 0.7,
  },
  thin_documents: knowledge.documents.filter((item) => item.evidence.length < 3).map((item) => ({ id: item.id, evidence_count: item.evidence.length, confidence: item.confidence })),
  missing_requested_platforms: ["github", "reddit", "linkedin", "nowcoder", "xiaohongshu"].filter((platform) => !byPlatform[platform]),
};

await writeFile(join(rootDir, "data", "knowledge-quality.generated.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.current, null, 2));
