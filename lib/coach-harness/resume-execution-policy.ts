/** One bounded workflow, including time reserved for final review and commit. */
export type ResumeModelPhase = 'draft' | 'repair' | 'review';
export const RESUME_EXECUTION_LIMIT_MS = 230_000;
const SAVE_RESERVE_MS = 12_000;
const FINAL_REVIEW_RESERVE_MS = 55_000;

export function resumeCallTimeout(deadline: number, now: number, phase: ResumeModelPhase, requestedMs: number) {
  const reserved = SAVE_RESERVE_MS + (phase === 'review' ? 0 : FINAL_REVIEW_RESERVE_MS);
  const available = deadline - now - reserved;
  if (available < 8_000) throw new Error('LLM_REQUEST_TIMEOUT');
  return Math.min(requestedMs, phase === 'repair' ? 55_000 : requestedMs, available);
}

export function resumeOutputCanBeRepaired(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /empty response|incomplete response|模型输出中断|内容暂时无法整理/i.test(text);
}

export function resumeTransportCanKeepCheckpoint(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return resumeOutputCanBeRepaired(error) || /LLM_REQUEST_TIMEOUT|timed out|aborted/i.test(text);
}
