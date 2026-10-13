export type WorkspaceTab = "overview" | "evidence" | "resume" | "interview" | "review" | "salary";
const tabs = new Set<WorkspaceTab>(["overview", "evidence", "resume", "interview", "review", "salary"]);
type View = { opportunityId: string; tab: WorkspaceTab };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function workspaceViewKey(ownerId?: string): string | null {
  return ownerId?.trim() ? `yizhi:workspace-view:v1:${ownerId}` : null;
}

export function readWorkspaceView(storage: Storage, key: string, ownedIds: readonly string[], explicitTab?: WorkspaceTab): View | null {
  try {
    const saved: unknown = JSON.parse(storage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return null;
    const { opportunityId, tab } = saved as Record<string, unknown>;
    if (typeof opportunityId !== "string" || !ownedIds.includes(opportunityId) || !tabs.has(tab as WorkspaceTab)) return null;
    return { opportunityId, tab: explicitTab ?? tab as WorkspaceTab };
  } catch {
    return null;
  }
}

export function saveWorkspaceView(storage: Storage, key: string, view: View, ownedIds: readonly string[]): void {
  if (!ownedIds.includes(view.opportunityId) || !tabs.has(view.tab)) return;
  try {
    // Only navigation is cached; no answer, résumé, credentials or workflow stage.
    storage.setItem(key, JSON.stringify(view));
  } catch { /* Disabled storage must not block an interview. */ }
}
