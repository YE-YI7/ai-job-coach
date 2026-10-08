export type SavedSearch = { found?: boolean; status?: string; runId?: string; result?: unknown; error?: string };
/** An existing but stale batch must not turn a mount/reload into a paid rerun.
 * Only a genuinely first search may auto-start; manual search remains explicit. */
export function needsExplicitSearch(restore: boolean, saved: SavedSearch): boolean {
  return restore && !saved.found && Boolean(saved.runId || saved.status);
}
/** A refreshed page subscribes to the existing task; it never starts a duplicate search. */
export async function waitForSavedSearch(read: () => Promise<SavedSearch>, signal: AbortSignal,
  pause: (signal: AbortSignal) => Promise<void> = signal => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error("Aborted")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 3000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  }), attempts = 20): Promise<SavedSearch> {
  let saved: SavedSearch = { status: "running" };
  for (let i = 0; i < attempts; i++) {
    if (signal.aborted) throw Error("Aborted");
    await pause(signal);
    saved = await read();
    if (saved.found || !["pending", "running"].includes(saved.status || "")) return saved;
  }
  return saved;
}
