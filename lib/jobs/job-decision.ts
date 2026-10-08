/**
 * 用户对一条推荐岗位做的决定（PRD 2026-10-08 §5 A4）。
 *
 * 这一层解决的是「推荐完了然后呢」：以前界面只有「看看我适不适合」一个动作，
 * 用户看完依据却没地方表态，于是「暂不考虑」和「先核实」这两种真实结果
 * 在系统里根本不存在——批次里下一条还是同一条岗，谁也不知道你已经想过它。
 *
 * 三条口径：
 * 1. **决定属于这一批，不属于永久偏好**。「这次不考虑」绝不写成求职偏好；
 *    只有用户明确说「以后不要推荐销售」才走可确认的长期偏好吗（那条路在 `tier-intent.ts`）。
 * 2. **只有「推进」有副作用**（进工作台，状态仍是准备，不自动标记已投递）；
 *    「暂不考虑」「先核实」只记这一条决定，什么都不改。
 * 3. **保存必须回读到真实 id**。没有服务端给的 claim id 就不许说「已保存」——
 *    「假保存」在 §9.1 里是独立硬失败，不是体验瑕疵。
 *
 * 岗位身份用**来源链接**（`canonicalUrl`），和 FR-10 库里比对同一口径：
 * 认错比漏认贵，公司 + 岗位名会把同公司的两个城市并成一条。批次内的 `jobId` 照原样存进值里。
 *
 * 这一层会被卡片直接引用，所以只允许导入同样无服务端依赖的 `job-identity`。
 */
import { canonicalUrl } from "./job-identity";

export type JobDecisionKind = "advance" | "not_now" | "verify";

/** 界面文案一律从这里出，免得卡片和记录两处各写一套说法。 */
export const JOB_DECISION_LABEL: Record<JobDecisionKind, string> = {
  advance: "我会先推进",
  not_now: "暂不考虑",
  verify: "先核实",
};
export const JOB_DECISION_ORDER: JobDecisionKind[] = ["advance", "not_now", "verify"];

/**
 * 预置原因只给「这一条岗为什么」级别的选项，不碰长期偏好；
 * 界面同时允许自己写一句，两者都不强制（PRD：不强迫填表）。
 */
export const JOB_DECISION_REASONS: Record<JobDecisionKind, string[]> = {
  advance: ["方向对得上", "想先练这块再投", "地点和条件都合适"],
  not_now: ["方向不对", "级别或年限不合适", "地点不合适"],
  verify: ["在招状态要确认", "资格要求要确认", "薪资没写清"],
};

export const JOB_DECISION_CLAIM_TYPE = "job_decision";
/** 沿用 preference 表，批次＋链接分隔身份；保存原子性由 save_coach_job_decision 事务函数保证。 */
export const JOB_DECISION_ENTITY_PREFIX = "job_decision:";

export interface JobDecision {
  claimId: string;
  jobId: string;
  url: string;
  company: string;
  title: string;
  location: string;
  decision: JobDecisionKind;
  reason: string | null;
  /** 推荐批次 = 这一次查找的 run id，决定属于哪一批要能回查。 */
  batchRunId: string;
  /** 材料版本 = 查找时那份简历/方向/档位的联合指纹。 */
  materialsVersion: string;
  savedAt: string;
}

/** 决定只按来源链接归位：同一批里 jobId 会随搜索变化，链接不会。 */
export function decisionEntityKey(url: string, batchRunId?: string): string {
  return `${JOB_DECISION_ENTITY_PREFIX}${batchRunId ? `${batchRunId}:` : ''}${canonicalUrl(url)}`;
}

export function isJobDecisionKind(value: unknown): value is JobDecisionKind {
  return typeof value === "string" && (JOB_DECISION_ORDER as string[]).includes(value);
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const HEX64 = /^[\da-f]{64}$/i;
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * 接口入参校验：读不出来的一律拒，不写半截数据。
 * `batchRunId` 必须是 uuid、`materialsVersion` 必须是 64 位十六进制——
 * 这两个字段是「这条决定是对哪一批、哪份材料做的」的唯一凭据，填成别的字符串就等于没记。
 */
export function parseDecisionInput(body: unknown): { ok: true; input: Omit<JobDecision, "claimId" | "savedAt"> } | { ok: false; error: string } {
  const row = (body ?? {}) as Record<string, unknown>;
  const url = clip(row.url, 600);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, error: "这条岗位缺来源链接，决定没法归位" }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, error: "来源链接不是网页地址，决定没有保存" };
  const jobId = clip(row.jobId, 100);
  const company = clip(row.company, 200);
  const title = clip(row.title, 200);
  if (!jobId || !company || !title) return { ok: false, error: "决定要写清是哪条岗位，这条没有保存" };
  if (!isJobDecisionKind(row.decision)) return { ok: false, error: "决定只认「先推进 / 暂不考虑 / 先核实」三种" };
  if (typeof row.batchRunId !== "string" || !UUID.test(row.batchRunId)) return { ok: false, error: "缺推荐批次号，决定没有保存" };
  if (typeof row.materialsVersion !== "string" || !HEX64.test(row.materialsVersion)) return { ok: false, error: "缺当前材料版本，决定没有保存" };
  if (row.reason !== undefined && row.reason !== null && typeof row.reason !== "string") return { ok: false, error: "原因要写成一句话" };
  const reason = clip(row.reason, 200);
  return { ok: true, input: {
    jobId, url, company, title, location: clip(row.location, 200), decision: row.decision,
    reason: reason || null, batchRunId: row.batchRunId, materialsVersion: row.materialsVersion,
  } };
}

/** 落库形状：`coach_claims` 的 `value` 存完整决定，`display_text` 存一行人能读的说法。 */
export function decisionClaimRow(input: Omit<JobDecision, "claimId" | "savedAt">) {
  return {
    entityKey: decisionEntityKey(input.url, input.batchRunId),
    claimType: JOB_DECISION_CLAIM_TYPE,
    value: input,
    displayText: `${JOB_DECISION_LABEL[input.decision]}：${input.company} · ${input.title}`,
    sourceExcerpt: input.reason,
  };
}

/**
 * 读回来的行只有全部字段成立才算一条决定；任何一项读不出来就当成没有，
 * 界面回到「还没表过态」——半截决定比没有决定更容易骗人。
 */
export function decisionFromValue(value: unknown, claimId: string, updatedAt?: string | null): JobDecision | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return null;
  const url = clip(row.url, 600);
  const jobId = clip(row.jobId, 100);
  const company = clip(row.company, 200);
  const title = clip(row.title, 200);
  if (!url || !jobId || !company || !title || !isJobDecisionKind(row.decision)) return null;
  if (typeof row.batchRunId !== "string" || !UUID.test(row.batchRunId)) return null;
  if (typeof row.materialsVersion !== "string" || !HEX64.test(row.materialsVersion)) return null;
  const reason = row.reason === null || row.reason === undefined ? null : clip(row.reason, 200);
  const savedAt = updatedAt && Date.parse(updatedAt) ? new Date(updatedAt).toISOString() : "";
  if (!savedAt) return null;
  return {
    claimId, jobId, url, company, title,
    location: clip(row.location, 200), decision: row.decision, reason,
    batchRunId: row.batchRunId, materialsVersion: row.materialsVersion, savedAt,
  };
}

/** 决定是「这一批里这条岗」的表态，界面按来源链接找回它。 */
export function decisionForUrl(decisions: JobDecision[], url: string, batchRunId?: string): JobDecision | undefined {
  const key = canonicalUrl(url);
  return decisions.find((item) => canonicalUrl(item.url) === key && (!batchRunId || item.batchRunId === batchRunId));
}

/**
 * 材料换过版本之后，旧决定还留着（那是用户当时的判断，不能偷偷改或删），
 * 但界面必须说清它是对旧材料做的——否则用户会以为「先核实」这条已经把新简历算进去了。
 */
export function isStaleMaterials(decision: JobDecision, currentMaterialsVersion: string | null): boolean {
  return !!currentMaterialsVersion && decision.materialsVersion !== currentMaterialsVersion;
}
