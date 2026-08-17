import compiledKnowledge from "@/data/knowledge-documents.generated.json";
import type {
  AgentKnowledgeDocument,
  AgentKnowledgeEvidence,
  AgentKnowledgeTask,
} from "./types";

type CompiledDocument = (typeof compiledKnowledge.documents)[number];

function normalized(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function normalizedTag(value?: string | null) {
  return normalized(value).replace(/[\s·._/-]+/g, "");
}

function queryTerms(value?: string | null) {
  const text = normalized(value);
  const weighted = new Map<string, number>();
  const add = (term: string, weight: number) => {
    if (term.length < 2) return;
    weighted.set(term, Math.max(weighted.get(term) || 0, weight));
  };
  for (const token of text.split(/[\s,，。；;、:：/|()（）\[\]【】]+/).filter(Boolean)) {
    if (/^[a-z0-9+.#-]+$/i.test(token)) add(token, token.length >= 4 ? 4 : 2);
    for (const run of token.match(/[\p{Script=Han}]+/gu) || []) {
      for (const size of [4, 3, 2]) {
        for (let index = 0; index <= run.length - size; index += 1) add(run.slice(index, index + size), size === 4 ? 4 : size === 3 ? 2 : 1);
      }
    }
  }
  return [...weighted.entries()].slice(0, 120).map(([term, weight]) => ({ term, weight }));
}

function includesEither(left: string, right: string) {
  const normalizedLeft = normalizedTag(left);
  const normalizedRight = normalizedTag(right);
  return Boolean(normalizedLeft && normalizedRight && (
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
  ));
}

function mapDocument(document: CompiledDocument): AgentKnowledgeDocument {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    goal: document.goal,
    scope: document.scope,
    roles: [...document.roles],
    companies: [...document.companies],
    stages: [...document.stages],
    tasks: document.tasks as AgentKnowledgeTask[],
    useWhen: [...document.use_when],
    doNotUseWhen: [...document.do_not_use_when],
    confidence: document.confidence as AgentKnowledgeDocument["confidence"],
    status: document.status as AgentKnowledgeDocument["status"],
    reviewedAt: document.reviewed_at,
    content: document.content,
    evidence: document.evidence.map((evidence): AgentKnowledgeEvidence => ({
      platform: evidence.platform as AgentKnowledgeEvidence["platform"],
      sourceKind: evidence.source_kind as AgentKnowledgeEvidence["sourceKind"],
      url: evidence.url,
      title: evidence.title,
      company: evidence.company,
      publishedAt: evidence.published_at,
      summary: evidence.summary,
    })),
  };
}

function scoreDocument(document: CompiledDocument, input: {
  task: AgentKnowledgeTask;
  query?: string | null;
  role?: string | null;
  company?: string | null;
  stage?: string | null;
}) {
  if (document.status !== "active") return Number.NEGATIVE_INFINITY;

  let score = document.tasks.includes(input.task) ? 12 : -18;
  const company = normalized(input.company);
  const role = normalized(input.role);
  const stage = normalized(input.stage);

  if (company) {
    if (document.companies.some((entry) => includesEither(entry, company))) score += 24;
    else if (document.companies.length) score -= 6;
  }
  if (role) {
    if (document.roles.some((entry) => includesEither(entry, role))) score += 16;
    else if (document.roles.length) return Number.NEGATIVE_INFINITY;
  }
  if (stage && document.stages.some((entry) => includesEither(entry, stage))) score += 10;

  const haystack = normalized([
    document.title,
    document.description,
    document.goal,
    document.scope,
    ...document.use_when,
    document.content,
  ].join(" "));
  let lexicalScore = 0;
  for (const { term, weight } of queryTerms(input.query)) {
    if (haystack.includes(term)) lexicalScore += weight;
  }
  return score + Math.min(lexicalScore, 36);
}

export function retrieveKnowledgeDocuments(input: {
  task: AgentKnowledgeTask;
  query?: string | null;
  role?: string | null;
  company?: string | null;
  stage?: string | null;
  limit?: number;
}): AgentKnowledgeDocument[] {
  const limit = Math.min(Math.max(input.limit || 4, 1), 8);
  return compiledKnowledge.documents
    .map((document) => ({ document, score: scoreDocument(document, input) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, limit)
    .map((entry) => mapDocument(entry.document));
}

export const knowledgeBaseMetadata = {
  version: compiledKnowledge.version,
  updatedAt: compiledKnowledge.updated_at,
  description: compiledKnowledge.description,
  goal: compiledKnowledge.goal,
};
