import type { Opportunity } from "./types";

export class ResumeRevisionConflict extends Error {
  constructor() { super("简历已在另一处更新，请刷新后继续；本次内容未覆盖新简历"); }
}

/** A late autosave may edit suggestions, but may not resurrect an older source. */
export function assertResumeRevision(current: Record<string, unknown>, incoming: Pick<Opportunity, "resumeRevision">, replacement?: { expectedResumeRevision: string | null }) {
  const revision = typeof current.resumeRevision === "string" ? current.resumeRevision : null;
  if (replacement) {
    if (replacement.expectedResumeRevision !== revision || !incoming.resumeRevision) throw new ResumeRevisionConflict();
  } else if (revision !== (incoming.resumeRevision ?? null) && (revision || current.resumeText)) throw new ResumeRevisionConflict();
}
