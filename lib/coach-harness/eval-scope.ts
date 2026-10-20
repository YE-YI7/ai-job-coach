import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface EvalSpan {
  id: string;
  name: string;
  agent?: string;
  kind: "agent" | "stage";
  status: "running" | "completed" | "failed" | "recorded";
  startedAt: string;
  durationMs: number;
  input: unknown;
  output: unknown;
  model?: string;
  usage?: {inputTokens:number;outputTokens:number;cacheHitTokens:number|null;estimatedCostUsd:number|null;pricingVersion:string|null;provider:string|null;retryCount:number|null};
  code?: string;
  knowledge: Array<{
    id: string;
    title: string;
    included: boolean;
    kind: string;
    similarity?: number;
    reason?: string;
  }>;
}
export type EvalStageIO = {
  input: unknown;
  output: unknown;
  knowledge?: EvalSpan["knowledge"];
};
type Observer = { spans: EvalSpan[]; save: () => Promise<void> };
const scope = new AsyncLocalStorage<Observer>();
export function withEvalObserver<T>(
  observer: Observer,
  action: () => Promise<T>,
) {
  return scope.run(observer, action);
}
export function getEvalObserver() {
  return scope.getStore();
}
export const EVAL_STAGE_NAMES: Record<string, string> = {
  context: "材料与上下文",
  retrieval: "知识检索",
  draft: "生成改稿",
  grounding: "事实校验",
  review: "独立复核",
  save: "结果保存",
  failure: "异常退出",
};
export function redactEval(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEval);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !["__proto__", "constructor", "prototype"].includes(key),
        )
        .map(([key, v]) => [
          key,
          /^(authorization|cookie|set-cookie|api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|resumeTaskLease)$/i.test(
            key,
          )
            ? "[已屏蔽凭据]"
            : redactEval(v),
        ]),
    );
  return typeof value === "string"
    ? value
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [已屏蔽]")
        .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[已屏蔽 API Key]")
    : value;
}
/** Private payload never enters product_events. Metadata-only checkpoints stay metadata. */
export function captureEvalStage(
  stage: string,
  code: string,
  io: EvalStageIO | undefined,
  startedAt: number,
  durationMs: number,
) {
  const observer = scope.getStore();
  if (!observer || !io) return;
  observer.spans.push({
    id: randomUUID(),
    name: EVAL_STAGE_NAMES[stage] || stage,
    code,
    kind: "stage",
    status: "recorded",
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    input: redactEval(io.input),
    output: redactEval(io.output),
    knowledge: io.knowledge || [],
  });
}
type RetrievalRecord = {
  includedIds?: unknown;
  methodCandidateIds?: unknown;
  excludedByBudgetIds?: unknown;
  matches?: unknown;
  documentTitles?: unknown;
};
function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}
/** 把简历 Trace 里的检索记录收成可展示的知识条目。标题优先用当次写入的标题，其次用知识库目录。 */
export function knowledgeFromRetrieval(
  retrieval: unknown,
  titles: Record<string, string> = {},
) {
  if (!retrieval || typeof retrieval !== "object") return [];
  const record = retrieval as RetrievalRecord;
  const included = new Set(stringList(record.includedIds));
  const methods = new Set(stringList(record.methodCandidateIds));
  const excluded = new Set(stringList(record.excludedByBudgetIds));
  const matches = Array.isArray(record.matches) ? record.matches : [];
  const writtenTitles = new Map<string, string>();
  if (Array.isArray(record.documentTitles)) {
    for (const item of record.documentTitles) {
      if (!item || typeof item !== "object") continue;
      const id = "id" in item && typeof item.id === "string" ? item.id : "";
      const title = "title" in item && typeof item.title === "string" ? item.title : "";
      if (id && title) writtenTitles.set(id, title);
    }
  }
  const ids = [
    ...new Set([
      ...included,
      ...methods,
      ...excluded,
      ...matches.flatMap((match) => {
        if (!match || typeof match !== "object" || !("id" in match)) return [];
        return typeof match.id === "string" ? [match.id] : [];
      }),
    ]),
  ];
  return ids.map((id) => {
    const match = matches.find(
      (item) => item && typeof item === "object" && "id" in item && item.id === id,
    ) as { similarity?: unknown; dimensions?: unknown } | undefined;
    const isIncluded = included.has(id);
    return {
      id,
      title: writtenTitles.get(id) || titles[id] || id,
      included: isIncluded,
      kind: methods.has(id) ? "method" : match ? "example" : "knowledge",
      ...(typeof match?.similarity === "number" ? { similarity: match.similarity } : {}),
      reason: excluded.has(id)
        ? "因上下文预算未纳入"
        : isIncluded
          ? "实际纳入上下文"
          : "候选，未纳入",
    };
  });
}
function retitleKnowledge(
  entries: EvalSpan["knowledge"],
  titles: Record<string, string>,
) {
  return entries.map((entry) => ({
    ...entry,
    title:
      entry.title && entry.title !== entry.id
        ? entry.title
        : titles[entry.id] || entry.title || entry.id,
  }));
}
function retrievalFromSpans(spans: EvalSpan[]) {
  for (const span of spans) {
    const output = span.output;
    if (output && typeof output === "object" && "retrieval" in output)
      return (output as { retrieval: unknown }).retrieval;
  }
  return null;
}
/** 读取已保存运行时补齐知识标题，并把检索结果挂到知识检索步骤。不改原始耗时。 */
export function presentEvalRun(
  run: Record<string, unknown>,
  titles: Record<string, string> = {},
  retrieval?: unknown,
) {
  const spans = Array.isArray(run.spans) ? (run.spans as EvalSpan[]) : [];
  const fromRetrieval = knowledgeFromRetrieval(
    retrieval || retrievalFromSpans(spans),
    titles,
  );
  const existing = Array.isArray(run.knowledge)
    ? (run.knowledge as EvalSpan["knowledge"])
    : [];
  // A partial legacy summary must not erase richer captured entries (or vice versa).
  const merged = new Map<string, EvalSpan["knowledge"][number]>();
  for (const entry of [...fromRetrieval, ...existing]) {
    const key = `${entry.id}:${entry.included}`;
    merged.set(key, { ...merged.get(key), ...entry });
  }
  const knowledge = retitleKnowledge([...merged.values()], titles);
  return {
    ...run,
    knowledge,
    spans: spans.map((span) => {
      const retrievalStage =
        span.kind === "stage" && span.name === EVAL_STAGE_NAMES.retrieval;
      if (span.knowledge?.length)
        return { ...span, knowledge: retitleKnowledge(span.knowledge, titles) };
      if (retrievalStage && knowledge.length) return { ...span, knowledge };
      return span;
    }),
  };
}
export function withEvalStages(run: Record<string, unknown>) {
  const captured: EvalSpan[] = Array.isArray(run.spans) ? run.spans : [];
  const stages: EvalSpan[] = Array.isArray(run.stages) ? run.stages : [];
  const spans = [
    ...stages.filter(
      (s) =>
        !captured.some(
          (c) => c.kind === "stage" && c.name === s.name && c.code === s.code,
        ),
    ),
    ...captured,
  ];
  spans.sort(
    (a, b) => (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0),
  );
  return { ...run, spans };
}
