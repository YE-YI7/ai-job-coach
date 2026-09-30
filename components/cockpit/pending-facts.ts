/**
 * W6-③ 待确认事实的批review队列（FR-4 · 设计文档 §5.4 三档确认）。
 *
 * 纪律：判定不等于事实——对话里抽出来的候选事实（status=unverified 的 claim）
 * 不在当场盘问用户，攒到学习记录页（我的笔记）一次性核对，每条可一键撤销。
 * 读取走已存在的 GET /api/coach/claims；确认/撤回动作发往 PATCH /api/coach/claims
 * （#61 已挂载：confirm → confirmClaim，withdraw → withdrawClaim，判定与写库都在
 * repository 一处）。端点不可用时界面如实说明，不假装成功。
 */

export interface PendingFact {
  id: string;
  displayText: string;
  entityType: string;
  sourceExcerpt: string;
  updatedAt: string;
  /** 迁移继承的确认状态不是本次确认，核对时要看得见这一点。 */
  inherited: boolean;
}

export interface FactReviewRequest {
  method: "PATCH";
  path: string;
  body: { claimId: string; action: "confirm" | "withdraw" };
}

const MAX_QUEUE = 100;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 从 GET /api/coach/claims 的响应里挑出待确认事实；按更新时间倒序、去重、限量。 */
export function pendingFactsFromResponse(raw: unknown): PendingFact[] {
  const claims = Array.isArray((raw as { claims?: unknown })?.claims) ? (raw as { claims: unknown[] }).claims : [];
  const seen = new Set<string>();
  const facts: PendingFact[] = [];
  for (const item of claims) {
    if (!item || typeof item !== "object") continue;
    const claim = item as Record<string, unknown>;
    if (claim.status !== "unverified") continue;
    const id = readString(claim.id);
    const displayText = readString(claim.displayText);
    if (!id || !displayText) continue;
    const key = displayText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      id,
      displayText: displayText.slice(0, 500),
      entityType: readString(claim.entityType) || "profile",
      sourceExcerpt: readString(claim.sourceExcerpt).slice(0, 300),
      updatedAt: readString(claim.updatedAt),
      inherited: Boolean(claim.migratedFrom),
    });
    if (facts.length >= MAX_QUEUE) break;
  }
  return facts;
}

/** 一次性核对里的单个动作；撤回即撤销这条候选，不删来源记录。 */
export function factReviewRequest(claimId: string, action: "confirm" | "withdraw"): FactReviewRequest {
  return { method: "PATCH", path: "/api/coach/claims", body: { claimId, action } };
}

/** 动作失败时的平实说明，不是错误堆栈。405 与 404 是两件事，分开说。 */
export function factActionFailureText(status: number): string {
  if (status === 405) return "确认入口还没开通（服务端缺 PATCH /api/coach/claims），这条先留在待核对里，不会进简历或档案。";
  if (status === 404) return "这条已经不在你的待核对列表里（可能刚被处理过），没有改动任何内容。";
  if (status === 401) return "请先登录，再核对这些事实。";
  return "这一步没有保存到云端，原状态保留，可稍后重试。";
}
