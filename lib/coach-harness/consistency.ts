import type {
  ArtifactDraft,
  CareerClaim,
  ConsistencyIssue,
  ConsistencyReport,
  ContextBundle,
} from "./types";

const NUMBER_PATTERN = /(?<![\p{L}\p{N}])(?:\d+(?:\.\d+)?%?|\d{4}[.-]\d{1,2})(?![\p{L}\p{N}])/gu;

function numberTokens(value: string) {
  return new Set((value.match(NUMBER_PATTERN) || []).map((token) => token.replaceAll("，", "")));
}

function claimNumberTokens(claim: CareerClaim) {
  const serialized = [claim.displayText, claim.sourceExcerpt || "", JSON.stringify(claim.value)].join("\n");
  return numberTokens(serialized);
}

export function findClaimConflicts(claims: CareerClaim[]) {
  const groups = new Map<string, CareerClaim[]>();
  for (const claim of claims.filter((item) => item.status !== "withdrawn")) {
    const key = `${claim.entityType}:${claim.entityKey}:${claim.claimType}`;
    groups.set(key, [...(groups.get(key) || []), claim]);
  }

  return [...groups.entries()].flatMap(([entityKey, group]) => {
    const values = new Set(group.map((claim) => JSON.stringify(claim.value)));
    return values.size > 1 || group.some((claim) => claim.status === "conflicted")
      ? [{ entityKey, claimIds: group.map((claim) => claim.id) }]
      : [];
  });
}

export function validateArtifactDraft(draft: ArtifactDraft, bundle: ContextBundle): ConsistencyReport {
  const claimById = new Map(bundle.claims.map((claim) => [claim.id, claim]));
  const issues: ConsistencyIssue[] = [];
  const referencedClaimIds = new Set<string>();

  for (const section of draft.sections) {
    if (section.content.trim() && section.claimIds.length === 0) {
      issues.push({
        code: "empty_provenance",
        severity: "error",
        path: section.path,
        message: "这段内容没有关联任何已知事实。",
      });
    }

    const allowedNumbers = new Set<string>();
    for (const claimId of section.claimIds) {
      referencedClaimIds.add(claimId);
      const claim = claimById.get(claimId);
      if (!claim) {
        issues.push({
          code: "unknown_claim",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `引用了不存在的事实 ${claimId}。`,
        });
        continue;
      }
      if (claim.status === "unverified") {
        issues.push({
          code: "unconfirmed_claim",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `事实「${claim.displayText}」尚未由用户确认。`,
        });
      }
      if (claim.status === "conflicted") {
        issues.push({
          code: "conflicted_claim",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `事实「${claim.displayText}」与其他记录冲突。`,
        });
      }
      for (const token of claimNumberTokens(claim)) allowedNumbers.add(token);
    }

    for (const token of numberTokens(section.content)) {
      if (!allowedNumbers.has(token)) {
        issues.push({
          code: "unsupported_number",
          severity: "error",
          path: section.path,
          token,
          message: `数字「${token}」没有出现在本段引用的已确认事实中。`,
        });
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    referencedClaimIds: [...referencedClaimIds],
    checkedAt: new Date().toISOString(),
  };
}
