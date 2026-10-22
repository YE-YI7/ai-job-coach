import { ENTRY_KINDS, type EntryKind } from "./entry-doors";

/**
 * Unsubmitted text for the four starting doors. Only the string survives a
 * refresh — a `File` cannot be re-offered by the browser, so the door records
 * that one existed and asks the person to pick it again instead of pretending
 * it is still attached.
 */
export type DoorDraft = { text: string; hadFile: boolean };
export type DoorDraftState = { account: string; drafts: Partial<Record<EntryKind, DoorDraft>>; chatOpen: EntryKind | null };

const STORAGE_KEY = "yi-zhi.start-doors-v1";
const EMPTY: Partial<Record<EntryKind, DoorDraft>> = {};

type WebStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

function safeStorage(): WebStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(): DoorDraftState | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || "null") as DoorDraftState | null;
    if (!parsed || typeof parsed.account !== "string" || typeof parsed.drafts !== "object" || parsed.drafts === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(state: DoorDraftState) {
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Safari private mode hands back a storage object whose setItem throws; a lost draft must not break the door.
  }
}

/** Another account's draft is never restored, even in the same tab. */
export function readDoorDrafts(account: string): Partial<Record<EntryKind, DoorDraft>> {
  const state = read();
  if (!state || state.account !== account) return EMPTY;
  const entries = Object.entries(state.drafts || {}) as [EntryKind, DoorDraft][];
  const clean: Partial<Record<EntryKind, DoorDraft>> = {};
  for (const [kind, draft] of entries) {
    if (!ENTRY_KINDS.includes(kind) || !draft || typeof draft.text !== "string" || typeof draft.hadFile !== "boolean") continue;
    if (draft.text || draft.hadFile) clean[kind] = draft;
  }
  return clean;
}

export function saveDoorDraft(account: string, kind: EntryKind, draft: DoorDraft) {
  const state = read();
  const drafts = state && state.account === account ? { ...state.drafts } : {};
  drafts[kind] = draft;
  write({ account, drafts, chatOpen: state && state.account === account ? state.chatOpen : null });
}

/** Which chat door this tab already submitted, so a refresh returns to the conversation. */
export function restoredChatEntry(account: string): EntryKind | null {
  const state = read();
  if (!state || state.account !== account) return null;
  return state.chatOpen && ENTRY_KINDS.includes(state.chatOpen) ? state.chatOpen : null;
}

export function markChatOpened(account: string, kind: EntryKind) {
  const state = read();
  const own = state && state.account === account ? state : { account, drafts: {}, chatOpen: null } as DoorDraftState;
  const drafts = { ...own.drafts };
  // Opening a chat is not a confirmed reply. Keep unsent/recoverable text until
  // the first saved reply is actually rendered; restoration never auto-sends.
  write({ ...own, drafts, chatOpen: kind });
}

/** Coming back to the doors clears the「已提交」marker so the inputs show again. */
export function clearChatOpened(account: string) {
  const state = read();
  if (!state || state.account !== account || state.chatOpen === null) return;
  write({ ...state, chatOpen: null });
}

/** A submitted door's text must not come back as an unsent draft. */
export function clearDoorDraft(account: string, kind: EntryKind) {
  const state = read();
  if (!state || state.account !== account) return;
  const drafts = { ...state.drafts };
  delete drafts[kind];
  write({ ...state, drafts });
}
