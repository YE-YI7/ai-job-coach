import { randomUUID } from "node:crypto";
import { callLLM } from "@/lib/llm";
import { getGenerationContext } from "@/lib/generation-context";
import { getEvalObserver, redactEval, type EvalSpan } from "./eval-scope";
export { withEvalObserver, redactEval, type EvalSpan } from "./eval-scope";

/** Only authorized workspace accounts and explicit admin samples install a scope.
 * Other users retain the original LLM behavior with no prompt capture. */
export async function observedResumeLLM(
  ...args: Parameters<typeof callLLM>
): Promise<string> {
  const observer = getEvalObserver();
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
      message: redactEval(
        error instanceof Error
          ? error.message.slice(0, 2000)
          : String(error).slice(0, 2000),
      ),
    };
    throw error;
  } finally {
    span.durationMs = Date.now() - start;
    await observer.save();
  }
}
