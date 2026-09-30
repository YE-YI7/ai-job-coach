/**
 * PRD FR-30 验收：「不该触达时的触达率 = 0」。
 * 这里穷举规则门的边界表——每条规则的「差一毫秒拒绝 / 刚好放行」两侧都要有断言，
 * 中间没有含糊空间。纯函数，不碰数据库、不碰模型。
 */

import { daysStalled, evaluateOutreachGate } from "./gate";
import {
  DEFAULT_OUTREACH_POLICY,
  type OutreachBlockCode,
  type OutreachFacts,
  type OutreachPolicy,
} from "./policy";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = Date.parse("2026-09-30T12:00:00.000Z");

/** 一条完全干净、只等被单条规则打破的基准事实。 */
function baseFacts(overrides: Partial<OutreachFacts> = {}): OutreachFacts {
  return {
    now: new Date(NOW),
    stage: "applied",
    stageEnteredAt: new Date(NOW - 3 * DAY),
    userTurnCount: 4,
    outreachSentThisTurn: 0,
    outreachTodayCount: 0,
    userIsTyping: false,
    lastBadAnswerAt: null,
    lastOutreachAt: null,
    ...overrides,
  };
}

interface GateCase {
  name: string;
  facts: Partial<OutreachFacts>;
  expectAllowed: boolean;
  /** 期望命中的拒绝码（允许命中更多，但这条必须在里面）。 */
  expectCode?: OutreachBlockCode;
  policy?: OutreachPolicy;
}

const cases: GateCase[] = [
  { name: "支持数字毫秒时间戳", facts: { now: NOW, stageEnteredAt: NOW - 3 * DAY }, expectAllowed: true },
  { name: "漏读今日次数不等于零", facts: { outreachTodayCount: undefined }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "漏读输入状态时静默", facts: { userIsTyping: undefined }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "NaN 次数不得绕过限流", facts: { outreachSentThisTurn: NaN }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "无效历史时间不可冒充无历史", facts: { lastOutreachAt: "invalid" }, expectAllowed: false, expectCode: "facts_missing" },
  // —— 停滞满 N 天 ——
  { name: "停滞刚好满 3 天（整点）→ 放行", facts: { stageEnteredAt: new Date(NOW - 3 * DAY) }, expectAllowed: true },
  { name: "停滞 2 天 23 小时 59 分 59.999 秒 → 拒绝", facts: { stageEnteredAt: new Date(NOW - 3 * DAY + 1) }, expectAllowed: false, expectCode: "stage_not_stalled" },
  { name: "停滞 3 天多 1 毫秒 → 放行", facts: { stageEnteredAt: new Date(NOW - 3 * DAY - 1) }, expectAllowed: true },
  { name: "停滞 2 天 → 拒绝", facts: { stageEnteredAt: new Date(NOW - 2 * DAY) }, expectAllowed: false, expectCode: "stage_not_stalled" },
  { name: "停滞 0 天（刚进阶段）→ 拒绝", facts: { stageEnteredAt: new Date(NOW) }, expectAllowed: false, expectCode: "stage_not_stalled" },
  { name: "阶段时间是未来（脏数据）→ 拒绝", facts: { stageEnteredAt: new Date(NOW + 5 * DAY) }, expectAllowed: false, expectCode: "stage_not_stalled" },
  { name: "停滞满 7 天 → 放行", facts: { stageEnteredAt: new Date(NOW - 7 * DAY) }, expectAllowed: true },
  { name: "自定义 N=5：停滞满 5 天 → 放行", facts: { stageEnteredAt: new Date(NOW - 5 * DAY) }, expectAllowed: true, policy: { ...DEFAULT_OUTREACH_POLICY, stallDaysRequired: 5 } },
  { name: "自定义 N=5：停滞 4 天 23 小时 → 拒绝", facts: { stageEnteredAt: new Date(NOW - 5 * DAY + HOUR) }, expectAllowed: false, expectCode: "stage_not_stalled", policy: { ...DEFAULT_OUTREACH_POLICY, stallDaysRequired: 5 } },

  // —— 刚答砸的冷却 ——
  { name: "30 分钟前答砸 → 拒绝", facts: { lastBadAnswerAt: new Date(NOW - 30 * MINUTE + 1) }, expectAllowed: false, expectCode: "bad_answer_cooldown" },
  { name: "1 分钟前答砸 → 拒绝", facts: { lastBadAnswerAt: new Date(NOW - MINUTE) }, expectAllowed: false, expectCode: "bad_answer_cooldown" },
  { name: "冷却刚好满 30 分钟 → 放行", facts: { lastBadAnswerAt: new Date(NOW - 30 * MINUTE) }, expectAllowed: true },
  { name: "冷却满 30 分钟又过 1 毫秒 → 放行", facts: { lastBadAnswerAt: new Date(NOW - 30 * MINUTE - 1) }, expectAllowed: true },
  { name: "答砸时间在将来（脏数据）→ 拒绝", facts: { lastBadAnswerAt: new Date(NOW + MINUTE) }, expectAllowed: false, expectCode: "bad_answer_cooldown" },
  { name: "自定义冷却 0 分钟 → 不设冷却", facts: { lastBadAnswerAt: new Date(NOW) }, expectAllowed: true, policy: { ...DEFAULT_OUTREACH_POLICY, badAnswerCooldownMinutes: 0 } },

  // —— 每轮最多 1 次 ——
  { name: "本轮已触达 1 次 → 拒绝", facts: { outreachSentThisTurn: 1 }, expectAllowed: false, expectCode: "outreach_already_sent_this_turn" },
  { name: "本轮已触达 3 次（异常台账）→ 拒绝", facts: { outreachSentThisTurn: 3 }, expectAllowed: false, expectCode: "outreach_already_sent_this_turn" },
  { name: "本轮 0 次 → 放行", facts: { outreachSentThisTurn: 0 }, expectAllowed: true },
  { name: "自定义每轮上限 2：本轮 1 次 → 放行", facts: { outreachSentThisTurn: 1 }, expectAllowed: true, policy: { ...DEFAULT_OUTREACH_POLICY, maxOutreachPerTurn: 2 } },
  { name: "自定义每轮上限 2：本轮 2 次 → 拒绝", facts: { outreachSentThisTurn: 2 }, expectAllowed: false, expectCode: "outreach_already_sent_this_turn", policy: { ...DEFAULT_OUTREACH_POLICY, maxOutreachPerTurn: 2 } },

  // —— 每日上限 ——
  { name: "今日已触达 1 次（上限 1）→ 拒绝", facts: { outreachTodayCount: 1 }, expectAllowed: false, expectCode: "daily_cap_reached" },
  { name: "今日 0 次 → 放行", facts: { outreachTodayCount: 0 }, expectAllowed: true },
  { name: "自定义每日上限 3：今日 2 次 → 放行", facts: { outreachTodayCount: 2 }, expectAllowed: true, policy: { ...DEFAULT_OUTREACH_POLICY, maxOutreachPerDay: 3 } },
  { name: "自定义每日上限 3：今日 3 次 → 拒绝", facts: { outreachTodayCount: 3 }, expectAllowed: false, expectCode: "daily_cap_reached", policy: { ...DEFAULT_OUTREACH_POLICY, maxOutreachPerDay: 3 } },

  // —— 两次触达最小间隔 ——
  { name: "24 小时前刚触达（差 1 毫秒）→ 拒绝", facts: { lastOutreachAt: new Date(NOW - 24 * HOUR + 1) }, expectAllowed: false, expectCode: "outreach_interval_too_short" },
  { name: "间隔刚好满 24 小时 → 放行", facts: { lastOutreachAt: new Date(NOW - 24 * HOUR) }, expectAllowed: true },
  { name: "间隔满 24 小时又过 1 毫秒 → 放行", facts: { lastOutreachAt: new Date(NOW - 24 * HOUR - 1) }, expectAllowed: true },
  { name: "3 小时前触达过 → 拒绝", facts: { lastOutreachAt: new Date(NOW - 3 * HOUR) }, expectAllowed: false, expectCode: "outreach_interval_too_short" },

  // —— 用户正在输入 ——
  { name: "用户正在输入 → 静默拒绝", facts: { userIsTyping: true }, expectAllowed: false, expectCode: "user_is_typing" },
  { name: "用户没在输入 → 放行", facts: { userIsTyping: false }, expectAllowed: true },
  { name: "关闭「输入时静默」策略 → 放行", facts: { userIsTyping: true }, expectAllowed: true, policy: { ...DEFAULT_OUTREACH_POLICY, silenceWhileUserTyping: false } },

  // —— 绝不替用户发第一句 ——
  { name: "用户还没开口（0 轮）→ 拒绝", facts: { userTurnCount: 0 }, expectAllowed: false, expectCode: "would_open_the_conversation" },
  { name: "用户刚开口 1 轮 → 放行", facts: { userTurnCount: 1 }, expectAllowed: true },
  { name: "userTurnCount 缺失 → fail-closed 拒绝", facts: { userTurnCount: undefined }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "userTurnCount 为 null → fail-closed 拒绝", facts: { userTurnCount: null }, expectAllowed: false, expectCode: "facts_missing" },

  // —— 收尾阶段不算停滞 ——
  { name: "阶段 won → 拒绝", facts: { stage: "won" }, expectAllowed: false, expectCode: "stage_closed" },
  { name: "阶段 lost → 拒绝", facts: { stage: "lost" }, expectAllowed: false, expectCode: "stage_closed" },
  { name: "阶段 withdrawn → 拒绝", facts: { stage: "withdrawn" }, expectAllowed: false, expectCode: "stage_closed" },
  { name: "阶段 archived → 拒绝", facts: { stage: "archived" }, expectAllowed: false, expectCode: "stage_closed" },
  { name: "阶段 interviewing 且停滞满 3 天 → 放行", facts: { stage: "interviewing", stageEnteredAt: new Date(NOW - 4 * DAY) }, expectAllowed: true },
  { name: "阶段 preparing_application 且停滞满 3 天 → 放行", facts: { stage: "preparing_application", stageEnteredAt: new Date(NOW - 4 * DAY) }, expectAllowed: true },
  { name: "阶段 captured 且停滞满 3 天 → 放行", facts: { stage: "captured", stageEnteredAt: new Date(NOW - 4 * DAY) }, expectAllowed: true },

  // —— 事实缺失一律拒绝 ——
  { name: "缺 stage → 拒绝", facts: { stage: null }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "缺 stageEnteredAt → 拒绝", facts: { stageEnteredAt: null }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "stageEnteredAt 是脏字符串 → 拒绝", facts: { stageEnteredAt: "不是时间" }, expectAllowed: false, expectCode: "facts_missing" },
  { name: "now 是脏值 → 拒绝", facts: { now: "不是时间" }, expectAllowed: false, expectCode: "facts_missing" },

  // —— 多因叠加 ——
  {
    name: "停滞不足 + 冷却中 + 本轮已发 + 正在输入 → 四条原因全记",
    facts: {
      stageEnteredAt: new Date(NOW - 1 * DAY),
      lastBadAnswerAt: new Date(NOW - MINUTE),
      outreachSentThisTurn: 1,
      userIsTyping: true,
    },
    expectAllowed: false,
  },
];

describe("主动触达规则门（FR-30 边界表）", () => {
  test.each(cases)("$name", ({ facts, expectAllowed, expectCode, policy }) => {
    const decision = evaluateOutreachGate(baseFacts(facts), policy ?? DEFAULT_OUTREACH_POLICY);
    expect(decision.allowed).toBe(expectAllowed);
    if (expectCode) expect(decision.blockedBy).toContain(expectCode);
    if (expectAllowed) {
      expect(decision.blockedBy).toEqual([]);
      expect(Object.keys(decision.reasons)).toEqual([]);
    } else {
      expect(decision.blockedBy.length).toBeGreaterThan(0);
      for (const code of decision.blockedBy) expect(decision.reasons[code]).toEqual(expect.any(String));
    }
  });

  test("表里每一条拒绝用例都必须给出机器可读原因", () => {
    for (const item of cases) {
      const decision = evaluateOutreachGate(baseFacts(item.facts), item.policy ?? DEFAULT_OUTREACH_POLICY);
      if (decision.allowed) continue;
      expect(decision.reasons[decision.blockedBy[0]]).toBeTruthy();
    }
  });

  test("多因叠加时全部原因都留下，不做单点短路", () => {
    const decision = evaluateOutreachGate(
      baseFacts({
        stageEnteredAt: new Date(NOW - 1 * DAY),
        lastBadAnswerAt: new Date(NOW - MINUTE),
        outreachSentThisTurn: 1,
        userIsTyping: true,
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockedBy).toEqual(
      expect.arrayContaining(["stage_not_stalled", "bad_answer_cooldown", "outreach_already_sent_this_turn", "user_is_typing"]),
    );
  });

  test("不放行的判定不依赖调用方传入的策略松紧", () => {
    // 把每轮上限调到 0 表示「彻底关掉主动触达」：任何事实都不该放行。
    const off: OutreachPolicy = { ...DEFAULT_OUTREACH_POLICY, maxOutreachPerTurn: 0 };
    expect(evaluateOutreachGate(baseFacts(), off).allowed).toBe(false);
    expect(evaluateOutreachGate(baseFacts(), off).blockedBy).toContain("outreach_already_sent_this_turn");
  });

  test("停滞天数按完整自然日向下取整", () => {
    expect(daysStalled(NOW, NOW - 3 * DAY)).toBe(3);
    expect(daysStalled(NOW, NOW - 3 * DAY + 1)).toBe(2);
    expect(daysStalled(NOW, NOW - 6 * DAY - HOUR)).toBe(6);
    expect(daysStalled(NOW, NOW + DAY)).toBe(-1);
  });

  test("评估时刻回写为 ISO，供台账与埋点核对", () => {
    const decision = evaluateOutreachGate(baseFacts());
    expect(decision.evaluatedAt).toBe(new Date(NOW).toISOString());
    expect(decision.stalledDays).toBe(3);
  });
});
