/**
 * W5 / PRD FR-30：主动触达的规则门（纯函数，无 IO、无模型、无随机）。
 *
 * 三条 PRD 门规（阶段停滞满 N 天 / 刚答砸冷却 / 每轮最多 1 次）加上
 * 设计文档 §5.8 的两条（每日上限、用户正在输入时静默）与一条
 * 身份红线（绝不替用户发第一句：用户还没开口时不得由系统开场）。
 *
 * 判定口径：
 *  - 一次评估收集**全部**命中原因，不做「第一个挡住就返回」，
 *    否则埋点看不到完整违规面，频控合规率无法核对。
 *  - 事实缺失 = 拒绝（fail-closed）。不该触达时触达率必须是 0。
 */

import {
  CLOSED_STAGES,
  DEFAULT_OUTREACH_POLICY,
  type OutreachBlockCode,
  type OutreachDecision,
  type OutreachFacts,
  type OutreachPolicy,
} from "./policy";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function toTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}

/** 满 N 天才算停滞：按完整自然日向下取整。 */
export function daysStalled(now: number, stageEnteredAt: number): number {
  return Math.floor((now - stageEnteredAt) / DAY_MS);
}

function block(
  code: OutreachBlockCode,
  message: string,
  blockedBy: OutreachBlockCode[],
  reasons: Partial<Record<OutreachBlockCode, string>>,
) {
  blockedBy.push(code);
  reasons[code] = message;
}

export function evaluateOutreachGate(
  facts: OutreachFacts,
  policy: OutreachPolicy = DEFAULT_OUTREACH_POLICY,
): OutreachDecision {
  const now = toTime(facts.now);
  const blockedBy: OutreachBlockCode[] = [];
  const reasons: Partial<Record<OutreachBlockCode, string>> = {};

  if (now === null) {
    return {
      allowed: false,
      blockedBy: ["facts_missing"],
      reasons: { facts_missing: "评估时刻无法解析，按不可触达处理" },
      evaluatedAt: new Date(0).toISOString(),
      policy,
      stalledDays: null,
    };
  }

  let stalledDays: number | null = null;

  // —— 事实完整性：缺任何一条硬事实都直接拒绝，不做乐观放行 ——
  const missing: string[] = [];
  if (!facts.stage) missing.push("stage");
  if (toTime(facts.stageEnteredAt) === null) missing.push("stageEnteredAt");
  for (const key of ["userTurnCount", "outreachSentThisTurn", "outreachTodayCount"] as const) {
    const value = facts[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) missing.push(key);
  }
  if (policy.silenceWhileUserTyping && typeof facts.userIsTyping !== "boolean") missing.push("userIsTyping");
  for (const key of ["lastBadAnswerAt", "lastOutreachAt"] as const) {
    // null 明确表示无历史；undefined / 非法日期表示未读取，不能当作从未发生。
    if (facts[key] === undefined || (facts[key] !== null && toTime(facts[key]) === null)) missing.push(key);
  }
  if (missing.length) {
    block("facts_missing", `缺少判定所需事实：${missing.join("、")}`, blockedBy, reasons);
  }

  // —— 阶段门 ——
  if (facts.stage && CLOSED_STAGES.includes(facts.stage)) {
    block("stage_closed", `阶段 ${facts.stage} 已收尾，不属于停滞`, blockedBy, reasons);
  }
  const stageEnteredAt = toTime(facts.stageEnteredAt);
  if (now !== null && stageEnteredAt !== null) {
    stalledDays = daysStalled(now, stageEnteredAt);
    if (stalledDays < policy.stallDaysRequired) {
      block(
        "stage_not_stalled",
        `阶段停滞 ${Math.max(0, stalledDays)} 天，未满 ${policy.stallDaysRequired} 天`,
        blockedBy,
        reasons,
      );
    }
  }

  // —— 冷却门：刚答砸之后一段时间内安静 ——
  const badAnswerAt = toTime(facts.lastBadAnswerAt);
  if (badAnswerAt !== null) {
    const cooldownMs = policy.badAnswerCooldownMinutes * MINUTE_MS;
    const elapsed = now - badAnswerAt;
    if (elapsed < cooldownMs) {
      block(
        "bad_answer_cooldown",
        `上一条回答不理想，冷却 ${policy.badAnswerCooldownMinutes} 分钟，已过 ${Math.max(0, Math.floor(elapsed / MINUTE_MS))} 分钟`,
        blockedBy,
        reasons,
      );
    }
  }

  // —— 频控门 ——
  const sentThisTurn = facts.outreachSentThisTurn ?? 0;
  if (sentThisTurn >= policy.maxOutreachPerTurn) {
    block("outreach_already_sent_this_turn", `本轮已触达 ${sentThisTurn} 次，上限 ${policy.maxOutreachPerTurn} 次`, blockedBy, reasons);
  }
  const sentToday = facts.outreachTodayCount ?? 0;
  if (sentToday >= policy.maxOutreachPerDay) {
    block("daily_cap_reached", `今日已触达 ${sentToday} 次，上限 ${policy.maxOutreachPerDay} 次`, blockedBy, reasons);
  }
  const lastOutreachAt = toTime(facts.lastOutreachAt);
  if (lastOutreachAt !== null) {
    const intervalMs = policy.minHoursBetweenOutreach * HOUR_MS;
    const elapsed = now - lastOutreachAt;
    if (elapsed < intervalMs) {
      block(
        "outreach_interval_too_short",
        `距上次触达 ${Math.max(0, Math.floor(elapsed / HOUR_MS))} 小时，需间隔 ${policy.minHoursBetweenOutreach} 小时`,
        blockedBy,
        reasons,
      );
    }
  }

  // —— 用户正在输入：静默 ——
  if (policy.silenceWhileUserTyping && facts.userIsTyping === true) {
    block("user_is_typing", "用户正在输入，保持静默", blockedBy, reasons);
  }

  // —— 身份红线：绝不替用户开第一句 ——
  if (facts.userTurnCount !== null && facts.userTurnCount !== undefined && facts.userTurnCount <= 0) {
    block("would_open_the_conversation", "用户还没有发言，系统不得替用户开场", blockedBy, reasons);
  }

  return {
    allowed: blockedBy.length === 0,
    blockedBy,
    reasons,
    evaluatedAt: new Date(now).toISOString(),
    policy,
    stalledDays,
  };
}

/** 供埋点与看板使用：一次判定的一句话摘要，不含任何用户内容。 */
export function summarizeOutreachDecision(decision: OutreachDecision): string {
  if (decision.allowed) return `放行（停滞 ${decision.stalledDays ?? "?"} 天）`;
  return `拒绝（${decision.blockedBy.join(", ")}）`;
}
