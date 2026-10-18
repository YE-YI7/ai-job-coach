import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { callLLM } from "@/lib/llm";
import { getGenerationContext } from "@/lib/generation-context";

export interface EvalSpan {
  id: string;
  name: string;
  agent: string;
  kind: "agent";
  status: "running" | "completed" | "failed";
  startedAt: string;
  durationMs: number;
  input: unknown;
  output: unknown;
  model?: string;
  knowledge: Array<{
    id: string;
    title: string;
    included: boolean;
    kind: string;
  }>;
}
type Observer = { spans: EvalSpan[]; save: () => Promise<void> };
const scope = new AsyncLocalStorage<Observer>();
export function withEvalObserver<T>(
  observer: Observer,
  action: () => Promise<T>,
) {
  return scope.run(observer, action);
}
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
          /^(authorization|cookie|api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)$/i.test(
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
/** Only the explicit, admin-authorized eval route installs a scope. Normal rewrites
 * keep the original LLM behavior and do not persist prompts or answers. */
export async function observedResumeLLM(
  ...args: Parameters<typeof callLLM>
): Promise<string> {
  const observer = scope.getStore();
  if (!observer) return callLLM(...args);
  const context = getGenerationContext(),
    start = Date.now();
  const agent =
    context?.operation === "resume_draft"
      ? "改稿 Agent"
      : context?.requestId?.includes("self-eval")
        ? "LLM 自评"
        : context?.requestId?.includes("unchanged")
          ? "原稿复核 Agent"
          : "独立质检 Agent";
  const span: EvalSpan = {
    id: randomUUID(),
    name: agent,
    agent,
    kind: "agent",
    status: "running",
    startedAt: new Date(start).toISOString(),
    durationMs: 0,
    input: redactEval({
      messages: args[0],
      options: {
        model: args[1]?.model,
        provider: args[1]?.provider,
        maxTokens: args[1]?.maxTokens,
        temperature: args[1]?.temperature,
      },
    }),
    output: null,
    knowledge: (context?.knowledgeDocumentIds || []).map((id) => ({
      id,
      title: id,
      included: true,
      kind: "knowledge",
    })),
  };
  observer.spans.push(span);
  await observer.save();
  try {
    const output = await callLLM(args[0], {
      ...args[1],
      onUsage: (details) => {
        span.model = details.model;
        args[1]?.onUsage?.(details);
      },
    });
    span.output = redactEval(output);
    span.status = "completed";
    return output;
  } catch (error) {
    span.status = "failed";
    span.output = {
      error: "模型调用未完成",
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
    throw error;
  } finally {
    span.durationMs = Date.now() - start;
    await observer.save();
  }
}
