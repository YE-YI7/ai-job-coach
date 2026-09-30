/**
 * W5 / PRD FR-30：主动触达的规则门策略与事实形状。
 *
 * 纪律（harness-design §5.8）：**规则门先行，模型只在门内决定说什么**。
 * 因此这个文件里没有任何模型参与——只有纯数据形状 + 可审计的阈值常量。
 * 阈值全部集中在这里，方便第 2 层回放和后续调参时一次看完，
 * 不允许在调用方各写一份数字。
 */

/** 阶段停滞满多少「整天」才允许触达（PRD 的 N 天）。 */
export const DEFAULT_STALL_DAYS = 3;
/** 刚答砸之后的冷却分钟数。 */
export const DEFAULT_BAD_ANSWER_COOLDOWN_MINUTES = 30;
/** 两次主动触达之间的最小间隔小时数。 */
export const DEFAULT_MIN_HOURS_BETWEEN_OUTREACH = 24;
/** 每个自然日最多触达次数。 */
export const DEFAULT_MAX_OUTREACH_PER_DAY = 1;
/** 每一轮最多触达次数（PRD：每轮最多 1 次）。 */
export const DEFAULT_MAX_OUTREACH_PER_TURN = 1;

export interface OutreachPolicy {
  stallDaysRequired: number;
  badAnswerCooldownMinutes: number;
  minHoursBetweenOutreach: number;
  maxOutreachPerDay: number;
  maxOutreachPerTurn: number;
  /** 用户正在输入时静默（设计文档硬规则）。 */
  silenceWhileUserTyping: boolean;
}

export const DEFAULT_OUTREACH_POLICY: OutreachPolicy = {
  stallDaysRequired: DEFAULT_STALL_DAYS,
  badAnswerCooldownMinutes: DEFAULT_BAD_ANSWER_COOLDOWN_MINUTES,
  minHoursBetweenOutreach: DEFAULT_MIN_HOURS_BETWEEN_OUTREACH,
  maxOutreachPerDay: DEFAULT_MAX_OUTREACH_PER_DAY,
  maxOutreachPerTurn: DEFAULT_MAX_OUTREACH_PER_TURN,
  silenceWhileUserTyping: true,
};

/**
 * 已经收尾的阶段不做主动触达：这里的「停滞」不是卡住，是事情已经结束。
 * 取自 lib/opportunities/types.ts 的 OpportunityStage 真值。
 */
export const CLOSED_STAGES: readonly string[] = ["won", "lost", "withdrawn", "archived"];

/**
 * 规则门的输入。全部是「已经发生的事实」，由调用方（W6 / route 层）从库里取，
 * engagement 模块自己不查库、不推断、不调模型。
 *
 * 可选字段缺失时按 fail-closed 处理：判定为不可触达，而不是放行。
 */
export interface OutreachFacts {
  /** 评估时刻。必填，测试可控；不读 Date.now()。 */
  now: Date | string | number;
  /** 当前岗位阶段（OpportunityStage 字面量）。 */
  stage?: string | null;
  /** 进入当前阶段的时间，用来算停滞天数。 */
  stageEnteredAt?: Date | string | number | null;
  /** 本会话里用户已经发言的轮数。0 表示用户还没开口。 */
  userTurnCount?: number | null;
  /** 本轮已经发出的主动触达次数。 */
  outreachSentThisTurn?: number | null;
  /** 今日已发出的主动触达次数。 */
  outreachTodayCount?: number | null;
  /** 上一次主动触达时间。 */
  lastOutreachAt?: Date | string | number | null;
  /** 上一次「答砸」的时间（用户纠正、明确负反馈、被打断的流式回答）。 */
  lastBadAnswerAt?: Date | string | number | null;
  /** 用户正在输入。 */
  userIsTyping?: boolean | null;
}

/** 规则拒绝码。每条都是一个可独立断言、可独立埋点的原因。 */
export type OutreachBlockCode =
  | "facts_missing"
  | "stage_closed"
  | "stage_not_stalled"
  | "bad_answer_cooldown"
  | "outreach_already_sent_this_turn"
  | "daily_cap_reached"
  | "outreach_interval_too_short"
  | "user_is_typing"
  | "would_open_the_conversation";

export const OUTREACH_BLOCK_CODES: readonly OutreachBlockCode[] = [
  "facts_missing",
  "stage_closed",
  "stage_not_stalled",
  "bad_answer_cooldown",
  "outreach_already_sent_this_turn",
  "daily_cap_reached",
  "outreach_interval_too_short",
  "user_is_typing",
  "would_open_the_conversation",
];

export interface OutreachDecision {
  allowed: boolean;
  /** 全部命中原因，按固定顺序；allowed 时为空数组。 */
  blockedBy: OutreachBlockCode[];
  /** 人类可读的判定依据，进埋点，供复盘「为什么没冒出来」。 */
  reasons: Partial<Record<OutreachBlockCode, string>>;
  evaluatedAt: string;
  policy: OutreachPolicy;
  /** 停滞天数（能算出来时）。 */
  stalledDays: number | null;
}
