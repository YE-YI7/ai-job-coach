"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

type BlockDraft = { id: string; original: string; text: string; headingOnly: boolean; restoreFocus?: () => void };
type StoredDraft = Omit<BlockDraft, "restoreFocus">;
const Drafts = createContext<Map<string, StoredDraft> | null>(null);

/** Unsaved text survives same-workspace view changes, not logout or reload.
 * Never put résumé text in a module singleton or browser storage. */
export function ResumeDraftSession({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, StoredDraft>());
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}

export function useResumeBlockDraft(key: string) {
  const drafts = useContext(Drafts);
  const [draft, setDraft] = useState<BlockDraft | null>(() => drafts?.get(key) ?? null);
  useLayoutEffect(() => {
    if (!drafts) return;
    if (draft) {
      const { id, original, text, headingOnly } = draft;
      drafts.set(key, { id, original, text, headingOnly });
    } else drafts.delete(key);
  }, [draft, drafts, key]);
  return [draft, setDraft] as const;
}
