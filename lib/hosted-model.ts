// Server-only configuration: never expose provider credentials to the client.
export function hostedStepModel(): string | null {
  return process.env.HOSTED_LLM_PROVIDER === "stepfun"
    ? process.env.HOSTED_LLM_MODEL?.trim() || "step-3.7-flash"
    : null;
}
