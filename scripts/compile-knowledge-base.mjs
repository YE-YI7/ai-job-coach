import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const knowledgeDir = join(rootDir, "knowledge-base");
const manifestPath = join(knowledgeDir, "manifest.json");
const sourcePath = join(rootDir, "data", "job-knowledge.seed.json");
const webOutputPath = join(rootDir, "data", "knowledge-documents.generated.json");
const pluginOutputPath = join(rootDir, ".agents", "plugins", "plugins", "yi-zhi", "knowledge", "knowledge-documents.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sources = JSON.parse(await readFile(sourcePath, "utf8"));
const sourceByUrl = new Map(sources.map((source) => [source.canonical_url, source]));

if (!Array.isArray(manifest.documents) || !manifest.documents.length) {
  throw new Error("knowledge-base/manifest.json must contain documents.");
}

const seenIds = new Set();
const seenPaths = new Set();
const requiredText = ["id", "title", "path", "description", "goal", "scope", "confidence", "status", "reviewed_at"];
const requiredArrays = ["roles", "companies", "stages", "tasks", "use_when", "do_not_use_when", "evidence_urls"];

const documents = [];
for (const document of manifest.documents) {
  for (const field of requiredText) {
    if (typeof document[field] !== "string" || !document[field].trim()) {
      throw new Error(`Knowledge document is missing ${field}: ${document.id || document.path || "unknown"}`);
    }
  }
  for (const field of requiredArrays) {
    if (!Array.isArray(document[field])) {
      throw new Error(`Knowledge document has invalid ${field}: ${document.id}`);
    }
  }
  if (seenIds.has(document.id)) throw new Error(`Duplicate knowledge document id: ${document.id}`);
  if (seenPaths.has(document.path)) throw new Error(`Duplicate knowledge document path: ${document.path}`);
  seenIds.add(document.id);
  seenPaths.add(document.path);

  const absolutePath = resolve(knowledgeDir, document.path);
  if (relative(knowledgeDir, absolutePath).startsWith("..")) {
    throw new Error(`Knowledge document path escapes the knowledge base: ${document.path}`);
  }
  const content = (await readFile(absolutePath, "utf8")).trim();
  if (!content.startsWith("# ")) throw new Error(`Knowledge document must start with an H1: ${document.path}`);

  const evidence = document.evidence_urls.map((url) => {
    const source = sourceByUrl.get(url);
    if (!source) throw new Error(`Unknown evidence URL in ${document.id}: ${url}`);
    return {
      platform: source.platform,
      source_kind: source.source_kind,
      url: source.canonical_url,
      title: source.title,
      company: source.company || null,
      published_at: source.published_at || null,
      summary: source.summary,
    };
  });

  documents.push({
    ...document,
    content,
    evidence,
  });
}

const output = {
  version: manifest.version,
  updated_at: manifest.updated_at,
  description: manifest.description,
  goal: manifest.goal,
  policy: (await readFile(join(knowledgeDir, manifest.policy_path), "utf8")).trim(),
  documents,
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(webOutputPath, serialized);
await writeFile(pluginOutputPath, serialized);
console.log(`Compiled ${documents.length} knowledge documents from ${sources.length} evidence sources.`);
