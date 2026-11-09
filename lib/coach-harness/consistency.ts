import { isCitableSource, type ArtifactDraft, type CareerClaim, type ConsistencyIssue, type ConsistencyReport, type ContextBundle } from "./types";

// Han text has no mandatory word spaces. Both “提升6.4个百分点” and
// “提升 6.4 个百分点” must expose the same number, without treating Vue3
// or a model version as a metric. Unknown numbers still fail closed.
const NUMBER_PATTERN = /(?<![A-Za-z\d])(?:[¥￥$]?\d+(?:[.,]\d+)?(?:%|万|亿|[kK]|人|次|个月|年|天|元)?|\d{4}[.-]\d{1,2})(?![A-Za-z\d])/gu;

function numberTokens(value: string) {
  // Equivalent calendar notation is not an invented decimal metric. Do not
  // normalize percentages/currency, infer a month, or accept another month.
  const dates=value
    .replace(/((?:19|20)\d{2})\s*年\s*(0?[1-9]|1[0-2])\s*月(?:份)?/g,
      (_,year,month)=>`${year}.${String(Number(month)).padStart(2,'0')}`)
    .replace(/(?<![A-Za-z\d¥￥$])((?:19|20)\d{2})[.-](0?[1-9]|1[0-2])(?=\s*(?:起|至|以来|[-–—]|[|｜\n]|$))/g,
      (_,year,month)=>`${year}.${String(Number(month)).padStart(2,'0')}`);
  const canonical=dates.replace(/(\d)\s+(?=%|万|亿|[kK]|人|次|个月|年|天|元)/g,'$1');
  return new Set((canonical.match(NUMBER_PATTERN) || []).map((token) => token.replaceAll("，", "")));
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
  // 被拦下的事实不在 Prompt 里，但校验时要能说清「为什么不能用」，
  // 而不是笼统报成「引用了不存在的事实」。
  const claimById = new Map(
    [...bundle.claims, ...(bundle.blockedClaimDetails || [])].map((claim) => [claim.id, claim]),
  );
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
      // 是否可用由 source_kind 决定：模型抽取和系统推断一律不能当履历。
      if (!isCitableSource(claim.sourceKind)) {
        issues.push({
          code: "unsupported_source",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `事实「${claim.displayText}」来自${claim.sourceKind === "ai_extraction" ? "模型抽取" : "系统推断"}，未经用户确认，不能写进对外材料。`,
        });
      } else if (claim.status === "unverified") {
        // 用户自己上传的材料可以用，但要提醒确认口径。PRD §3.6：不直接判造假或扣能力分。
        issues.push({
          code: "unverified_source_claim",
          severity: "warning",
          path: section.path,
          claimIds: [claimId],
          message: `事实「${claim.displayText}」来自你上传的材料，尚未逐条确认；数字口径可能被追问。`,
        });
      }
      if (claim.status === "withdrawn") {
        issues.push({
          code: "withdrawn_claim",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `事实「${claim.displayText}」已被撤回。`,
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
      if ((draft.visibility === "public" || draft.visibility === "recruiter_safe") && claim.visibility === "private") {
        issues.push({
          code: "private_claim_exposure",
          severity: "error",
          path: section.path,
          claimIds: [claimId],
          message: `私密事实「${claim.displayText}」不能用于对外材料。`,
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
