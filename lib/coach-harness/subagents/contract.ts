/**
 * 子 Agent 契约的共享骨架（Harness 设计 §5.5 五件套 / PRD「子 Agent 的契约」章）。
 *
 * 这一层只管四件事，全部是确定性代码，不含任何模型判定：
 * 1. 输入只收结构化字段——类型上每份 Input 是闭合接口，运行时再有一道
 *    `assertStructuredInput` 拦截鸭子类型混进来的对话数组（整段灌入会让
 *    预算与注入防线双双失效，所以这里禁的是形态本身，不是某个字段名）。
 * 2. 产物形态：每条结论必须带来源指针；软匹配必须带命中字段与理由。
 * 3. 预算/墙钟/幂等键 + 扇出「事前报价、事后计量」。
 * 4. 失败语义：failed 分支**没有 product 键**，半成品在类型层面就流不进主 prompt；
 *    主 Agent 只能拿到固定失败话术。degraded 是显式约定的降级产物（如核验失败
 *    全部保留并标注未核验），不是半成品。
 *
 * 信任层级沿用 `@/lib/coach-harness/types` 的 claim 词汇（SourceKind /
 * VerificationLevel / ClaimStatus），本文件只补一个外部维度：untrusted。
 */
import type { SourceKind, VerificationLevel } from "@/lib/coach-harness/types";

export type SubAgentId = "retrieval" | "verification" | "research" | "state-observation" | "resume";

export const SUB_AGENT_IDS: readonly SubAgentId[] = [
  "retrieval",
  "verification",
  "research",
  "state-observation",
  "resume",
];

/* ------------------------------------------------------------------ */
/* 一、输入：只收结构化字段                                            */
/* ------------------------------------------------------------------ */

/**
 * 主对话消息的形状。输入里一旦出现「带 role+content 的数组」，
 * 就视为「整段对话灌入」，运行时直接拒绝——不靠调用方自觉。
 */
export interface ChatMessageLike {
  role: string;
  content: unknown;
}

/** 明确禁止出现在 Input 里的字段名（大小写不敏感）。 */
export const FORBIDDEN_INPUT_KEYS: readonly string[] = [
  "messages",
  "transcript",
  "history",
  "conversation",
  "dialog",
  "dialogue",
  "turns",
  "chatlog",
  "chat_history",
  "recentrounds",
];

/** 单个数组字段的元素数上限：超过即视为在走私对话，而不是关键词列表。 */
export const MAX_INPUT_ARRAY_LENGTH = 64;
/** 单个字符串字段长度上限：超过即视为在走私原文而不是字段。 */
export const MAX_INPUT_STRING_LENGTH = 2_000;

export class TranscriptInputError extends Error {
  constructor(public readonly path: string, public readonly why: "forbidden_key" | "message_shape" | "oversized") {
    super(`子 Agent 输入必须是结构化字段，在 ${path} 处被拒（${why}）`);
    this.name = "TranscriptInputError";
  }
}

function isMessageLike(value: Record<string, unknown>): boolean {
  return typeof value.role === "string" && "content" in value;
}

/**
 * 运行时闸门：对任意 Input 做深度检查。类型层的闭合接口已经让
 * `{ messages: [...] }` 在编译期报 excess-property；这里兜住
 * `Record<string, unknown>` 鸭子类型传入的同一形状。
 */
export function assertStructuredInput(value: unknown, path = "input", depth = 0): void {
  if (depth > 8) throw new TranscriptInputError(path, "oversized");
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > MAX_INPUT_ARRAY_LENGTH) throw new TranscriptInputError(path, "oversized");
    value.forEach((item, i) => assertStructuredInput(item, `${path}[${i}]`, depth + 1));
    return;
  }
  const record = value as Record<string, unknown>;
  if (isMessageLike(record)) throw new TranscriptInputError(path, "message_shape");
  for (const [key, inner] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_INPUT_KEYS.some((fk) => lower === fk || lower.includes(fk))) {
      throw new TranscriptInputError(`${path}.${key}`, "forbidden_key");
    }
    if (typeof inner === "string" && inner.length > MAX_INPUT_STRING_LENGTH) {
      throw new TranscriptInputError(`${path}.${key}`, "oversized");
    }
    assertStructuredInput(inner, `${path}.${key}`, depth + 1);
  }
}

/* ------------------------------------------------------------------ */
/* 二、来源指针与软匹配                                                */
/* ------------------------------------------------------------------ */

/**
 * 外部抓取一律 untrusted（P7）。提权为事实的唯一通道是用户确认
 * （`promoteToFact` 要求 user_confirmed 级别，类型与运行时双重把关）。
 */
export type ExternalTrust = "untrusted";

export type SourcePointer =
  | { kind: "external"; url: string; fetchedAt: string; trust: ExternalTrust }
  | { kind: "user_material"; sourceKind: Extract<SourceKind, "user_upload" | "user_statement">; refId: string; quote?: string }
  | { kind: "deterministic_rule"; ruleId: string };

/** 软匹配必须自带复核材料：命中了哪个字段、凭什么。 */
export interface SoftMatch {
  matchedField: string;
  reason: string;
  /** 软匹配永远是判定不是事实：不许声明 verificationLevel ≥ user_confirmed。 */
  label: "外部信息" | "待你确认";
}

/**
 * 判定→事实的提权闸门（§0.3：判定不等于事实）。
 * 只有带用户确认凭证的调用才能拿到 fact 形状，否则抛错。
 */
export interface FactCandidate {
  statement: string;
  source: SourcePointer;
  currentLevel: VerificationLevel;
}

export interface PromotedFact {
  statement: string;
  source: SourcePointer;
  verificationLevel: "user_confirmed";
  confirmedBy: "user";
}

export function promoteToFact(
  candidate: FactCandidate,
  confirmation: { confirmedByUser: boolean } | undefined,
): PromotedFact | null {
  if (!confirmation?.confirmedByUser) return null;
  if (candidate.source.kind === "external") {
    // 外部信息即使被确认，也仍是「用户对某句话点了头」，来源保持 untrusted 指针。
    return {
      statement: candidate.statement,
      source: candidate.source,
      verificationLevel: "user_confirmed",
      confirmedBy: "user",
    };
  }
  return { statement: candidate.statement, source: candidate.source, verificationLevel: "user_confirmed", confirmedBy: "user" };
}

/* ------------------------------------------------------------------ */
/* 三、预算 / 超时 / 幂等 / 扇出                                       */
/* ------------------------------------------------------------------ */

export interface BudgetSpec {
  /** 计费与调用上限：注入数据源的最多调用次数（扇出预算）。 */
  maxSourceCalls: number;
  /** token 上限（扇出事前报价与事后计量都用它）。 */
  maxTokens: number;
  /** 墙钟上限（毫秒）。 */
  maxWallClockMs: number;
  /** 幂等键：同一键只跑一次，重放返回首次结果。 */
  idempotencyKey: string;
}

/** 事前报价：扇出路径在跑之前必须可报价（R-4：预算门）。 */
export interface FanOutQuote {
  billingUnits: number;
  plannedSourceCalls: number;
  estimatedTokens: number;
  estimatedWallClockMs: number;
  rationale: string;
}

/** 事后计量：跑完之后每一项都可核对。 */
export interface UsageMeter {
  billingUnits: number;
  sourceCalls: number;
  tokens: number;
  wallClockMs: number;
  budget: BudgetSpec;
}

export function quoteWithinBudget(quote: FanOutQuote, budget: BudgetSpec): boolean {
  return (
    quote.plannedSourceCalls <= budget.maxSourceCalls &&
    quote.estimatedTokens <= budget.maxTokens &&
    quote.estimatedWallClockMs <= budget.maxWallClockMs
  );
}

/* ------------------------------------------------------------------ */
/* 四、失败语义：failed 没有 product 键                                */
/* ------------------------------------------------------------------ */

export type FailureReason =
  | "source_error"
  | "budget_exhausted"
  | "wall_clock_timeout"
  | "no_result"
  | "insufficient_signals"
  | "internal_error";

export interface SubAgentFailure {
  reason: FailureReason;
  /** 主 Agent 出口话术：明确说没跑成，不假装在思考（§5.7 子 Agent 失败行）。 */
  userCopy: string;
  /** 有没有被扣下的半成品（只记有没有，永不外流内容本身）。 */
  partialWithheld: boolean;
  detail: string;
}

export interface DegradationNotice {
  what: string;
  userCopy: string;
}

/**
 * 三态产物。判别联合的意义：`mainPromptPayloadFor` 之外没有任何函数
 * 能从 failed 里取出内容——failed 分支根本没有 product 字段。
 */
export type SubAgentOutcome<TProduct> =
  | { status: "ok"; idempotencyKey: string; usage: UsageMeter; product: TProduct }
  | { status: "degraded"; idempotencyKey: string; usage: UsageMeter; product: TProduct; degradation: DegradationNotice }
  | { status: "failed"; idempotencyKey: string; usage: UsageMeter; failure: SubAgentFailure };

/** 主 prompt 唯一取料口：只有 ok/degraded 才有内容，failed 只能拿到话术。 */
export function mainPromptPayloadFor<TProduct>(
  outcome: SubAgentOutcome<TProduct>,
): { ok: true; product: TProduct; note: string | null } | { ok: false; userCopy: string } {
  if (outcome.status === "ok") return { ok: true, product: outcome.product, note: null };
  if (outcome.status === "degraded") return { ok: true, product: outcome.product, note: outcome.degradation.userCopy };
  return { ok: false, userCopy: outcome.failure.userCopy };
}

/* ------------------------------------------------------------------ */
/* 五、冲突仲裁：确定性规则层优先，并记录                              */
/* ------------------------------------------------------------------ */

export interface RuleVerdict {
  dedupeKey: string;
  decision: "keep" | "drop";
  ruleId: string;
  basis: string;
}

export interface OpinionVerdict {
  dedupeKey: string;
  decision: "keep" | "drop" | "unsure";
  matchedField: string;
  reason: string;
}

export interface ConflictRecord {
  dedupeKey: string;
  rule: RuleVerdict;
  opinion: OpinionVerdict;
  /** §5.5：两条子 Agent 意见冲突时以确定性规则层为准。 */
  resolvedBy: "deterministic_rule";
  finalDecision: "keep" | "drop";
  observedAt: string;
}

export function arbitrate(
  rule: RuleVerdict,
  opinion: OpinionVerdict | null,
  now: string,
): { decision: "keep" | "drop"; conflict: ConflictRecord | null } {
  if (!opinion || opinion.decision === rule.decision || opinion.decision === "unsure") {
    return { decision: rule.decision, conflict: null };
  }
  return {
    decision: rule.decision,
    conflict: {
      dedupeKey: rule.dedupeKey,
      rule,
      opinion,
      resolvedBy: "deterministic_rule",
      finalDecision: rule.decision,
      observedAt: now,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 六、幂等存储（注入接口；调用方通常传进程内 Map）                     */
/* ------------------------------------------------------------------ */

export interface IdempotencyStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

export function createInMemoryIdempotencyStore<T>(): IdempotencyStore<T> {
  const map = new Map<string, T>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
  };
}

/** 注入时钟：确定性测试不依赖真实计时器。 */
export interface Clock {
  nowMs(): number;
  /** ISO 日期，用于查询日期/抓取时间这类需要日历维度的地方。 */
  isoDate(): string;
}

export function fixedClock(isoOrMs: string | number): Clock {
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  return { nowMs: () => ms, isoDate: () => new Date(ms).toISOString().slice(0, 10) };
}
