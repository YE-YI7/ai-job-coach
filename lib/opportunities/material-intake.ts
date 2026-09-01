export type OpportunityMaterialKind = "job" | "resume" | "experience";

type ResumeShareCandidate = {
  workspaceType?: "job" | "preparation";
  resumeText?: string;
  profileText?: string;
};

function joinMaterial(current: string, incoming: string, maxLength: number) {
  return [current.trim(), incoming.trim()].filter(Boolean).join("\n\n").slice(0, maxLength);
}

export function mergeOpportunityMaterial(input: {
  kind?: string;
  sourceText: string;
  jdText: string;
  resumeText: string;
  maxLength?: number;
}) {
  const maxLength = input.maxLength ?? 30_000;
  if (input.kind === "resume" || input.kind === "experience") {
    return {
      jdText: input.jdText.trim().slice(0, maxLength),
      resumeText: joinMaterial(input.resumeText, input.sourceText, maxLength),
    };
  }
  if (input.kind === "job") {
    return {
      jdText: joinMaterial(input.jdText, input.sourceText, maxLength),
      resumeText: input.resumeText.trim().slice(0, maxLength),
    };
  }
  return {
    jdText: input.jdText.trim().slice(0, maxLength),
    resumeText: input.resumeText.trim().slice(0, maxLength),
  };
}

export function shareBaseResumeAcrossOpportunities<T extends ResumeShareCandidate>(opportunities: T[]) {
  const base = opportunities.find((item) => item.workspaceType === "preparation" && item.resumeText?.trim());
  if (!base?.resumeText?.trim()) return opportunities;
  let changed = false;
  const shared = opportunities.map((item) => {
    if (item.workspaceType === "preparation" || item.resumeText?.trim()) return item;
    changed = true;
    return {
      ...item,
      resumeText: base.resumeText,
      profileText: item.profileText || base.profileText,
    };
  });
  return changed ? shared : opportunities;
}
