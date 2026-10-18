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
  code?: string;
  knowledge: Array<{
    id: string;
    title: string;
    included: boolean;
    kind: string;
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
