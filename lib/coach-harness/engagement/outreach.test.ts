/**
 * 主动触达编排：证明「规则门先行、模型只在门内决定说什么」，
 * 以及频控合规率 100%（每轮最多 1 次、每日最多 1 次）。
 */

import {
  DEFAULT_OUTREACH_POLICY,
  applyOutreachCadence,
  commitOutreach,
  createCadence,
  evaluateOutreachGate,
  mergeCadenceIntoFacts,
  recordOutreachDecision,
  requestOutreach,
  type OutreachAuditRecord,
  type OutreachFacts,
} from "./index";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const BASE = Date.parse("2026-09-30T12:00:00.000Z");

function facts(overrides: Partial<OutreachFacts> = {}): OutreachFacts {
  return {
    now: new Date(BASE),
    stage: "applied",
    stageEnteredAt: new Date(BASE - 3 * DAY),
    userTurnCount: 4,
    outreachSentThisTurn: 0,
    outreachTodayCount: 0,
    userIsTyping: false,
    lastBadAnswerAt: null,
    lastOutreachAt: null,
    ...overrides,
  };
}

const goodDraft = {
  speaker: "tutor",
  text: "这一周岗位没什么动静，我们先把简历里那段实习改成产品口径？",
  suggestions: [{ kind: "offer_next_step", text: "改这段实习" }],
};

describe("主动触达编排", () => {
  test("门拒绝时模型一次都不被调用，触达率为 0", async () => {
    const draft = jest.fn().mockReturnValue(goodDraft);
    const deniedInputs: OutreachFacts[] = [
      facts({ stageEnteredAt: new Date(BASE - 1 * DAY) }),
      facts({ lastBadAnswerAt: new Date(BASE - MINUTE) }),
      facts({ outreachSentThisTurn: 1 }),
      facts({ outreachTodayCount: 1 }),
      facts({ userIsTyping: true }),
      facts({ userTurnCount: 0 }),
      facts({ stage: "lost" }),
      facts({ stageEnteredAt: null }),
    ];

    for (const input of deniedInputs) {
      const outcome = await requestOutreach({ facts: input, draft });
      expect(outcome.decision.allowed).toBe(false);
      expect(outcome.draftInvoked).toBe(false);
      expect(outcome.proposal).toBeNull();
    }
    expect(draft).not.toHaveBeenCalled();
  });

  test("门放行时才叫模型，并且产出的是导师身份的会话内建议", async () => {
    const draft = jest.fn().mockResolvedValue(goodDraft);
    const outcome = await requestOutreach({ facts: facts(), draft });
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft.mock.calls[0][0]).toMatchObject({ stalledDays: 3 });
    expect(outcome.draftInvoked).toBe(true);
    expect(outcome.violations).toEqual([]);
    expect(outcome.proposal).toMatchObject({ speaker: "tutor", delivery: "in_session_only", autoSend: false });
  });

  test("门放行但草稿越界（冒充用户/改状态）→ 仍然不发", async () => {
    const outcome = await requestOutreach({
      facts: facts(),
      draft: () => ({ ...goodDraft, sendAsUser: true }),
    });
    expect(outcome.draftInvoked).toBe(true);
    expect(outcome.proposal).toBeNull();
    expect(outcome.violations).toContain("impersonates_user");
  });

  test("判定与产出都进埋点，且埋点里没有消息正文", async () => {
    const records: OutreachAuditRecord[] = [];
    const sink = (record: OutreachAuditRecord) => {
      records.push(record);
    };
    const allowed = await requestOutreach({ facts: facts(), draft: () => goodDraft });
    await recordOutreachDecision(sink, allowed, { userId: "u1", turnId: "t1" });
    const denied = await requestOutreach({ facts: facts({ userIsTyping: true }), draft: () => goodDraft });
    await recordOutreachDecision(sink, denied, { userId: "u1", turnId: "t1" });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ allowed: true, produced: true, blockedBy: [], violations: [], stalledDays: 3 });
    expect(records[1]).toMatchObject({ allowed: false, produced: false, blockedBy: ["user_is_typing"] });
    expect(JSON.stringify(records)).not.toContain(goodDraft.text);
    // 没有 sink 时静默跳过，不能把辅导链路搞挂。
    await expect(recordOutreachDecision(undefined, allowed)).resolves.toBeUndefined();
  });

  test("连续 192 轮（每小时一轮，跨 8 个自然日）：频控合规率 100%，每天恰好 1 条", async () => {
    let cadence = createCadence("turn-0");
    let lastResetDay = 0;
    const producedPerDay = new Map<number, number>();
    const perTurnCounts: number[] = [];
    const draft = jest.fn(() => goodDraft);

    for (let i = 0; i < 192; i += 1) {
      const now = new Date(BASE + i * HOUR);
      const day = Math.floor((i * HOUR) / DAY);
      if (day !== lastResetDay) {
        cadence = { ...cadence, outreachTodayCount: 0 };
        lastResetDay = day;
      }
      // 每一轮都是新的 turnId：本轮计数必须清零，今日计数保留。
      cadence = applyOutreachCadence(cadence, { turnId: `turn-${i}`, at: now.toISOString(), produced: false });

      const outcome = await requestOutreach({
        facts: mergeCadenceIntoFacts(
          { now, stage: "applied", stageEnteredAt: new Date(Number(now) - 4 * DAY), userTurnCount: 4, userIsTyping: false, lastBadAnswerAt: null },
          cadence,
        ),
        draft,
      });
      if (outcome.proposal) {
        cadence = commitOutreach(cadence, now.toISOString());
        producedPerDay.set(day, (producedPerDay.get(day) ?? 0) + 1);
        perTurnCounts.push(cadence.outreachSentThisTurn);
      }
    }

    expect(producedPerDay.size).toBe(8); // 8 个自然日
    for (const count of producedPerDay.values()) expect(count).toBe(1); // 每日上限 1 次
    for (const count of perTurnCounts) {
      expect(count).toBeLessThanOrEqual(DEFAULT_OUTREACH_POLICY.maxOutreachPerTurn); // 每轮最多 1 次
    }
    expect(draft).toHaveBeenCalledTimes(8); // 门拒绝的 184 轮一次都没叫模型
  });

  test("台账：新一轮开始时本轮计数清零，今日计数继续累计", () => {
    let cadence = createCadence("turn-1");
    cadence = commitOutreach(cadence, new Date(BASE).toISOString());
    expect(cadence).toMatchObject({ outreachSentThisTurn: 1, outreachTodayCount: 1, lastOutreachAt: new Date(BASE).toISOString() });

    const sameTurn = applyOutreachCadence(cadence, { turnId: "turn-1", at: new Date(BASE + MINUTE).toISOString(), produced: false });
    expect(sameTurn.outreachSentThisTurn).toBe(1);

    const nextTurn = applyOutreachCadence(cadence, { turnId: "turn-2", at: new Date(BASE + MINUTE).toISOString(), produced: false });
    expect(nextTurn).toMatchObject({ turnId: "turn-2", outreachSentThisTurn: 0, outreachTodayCount: 1 });
    // 下一轮虽然清零了本轮计数，但今日已达上限、且距上次触达不足 24 小时，门依然拒绝。
    const nextTurnFacts = mergeCadenceIntoFacts(
      { now: new Date(BASE + 2 * HOUR), stage: "applied", stageEnteredAt: new Date(BASE - 2 * DAY), userTurnCount: 4 },
      nextTurn,
    );
    const denied = evaluateOutreachGate(nextTurnFacts, DEFAULT_OUTREACH_POLICY);
    expect(denied.allowed).toBe(false);
    expect(denied.blockedBy).toEqual(expect.arrayContaining(["daily_cap_reached", "outreach_interval_too_short"]));
  });

  test("facts 已显式给出计数时不被台账覆盖", () => {
    const cadence = createCadence("turn-1");
    const merged = mergeCadenceIntoFacts(facts({ outreachTodayCount: 3 }), cadence);
    expect(merged.outreachTodayCount).toBe(3);
    expect(merged.outreachSentThisTurn).toBe(0);
  });
});
