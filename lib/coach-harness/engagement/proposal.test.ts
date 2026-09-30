/**
 * PRD FR-31 验收：主动消息以导师身份发言、绝不替用户发第一句、只出建议不改状态。
 * 门内的产出校验必须做到「身份正确率 100%」且「无一次改写状态」。
 */

import { evaluateOutreachGate } from "./gate";
import {
  OUTREACH_DELIVERY,
  OUTREACH_MAX_TEXT_CHARS,
  OUTREACH_SUGGESTION_KINDS,
  assertOutreachIsReadOnly,
  buildOutreachProposal,
} from "./proposal";
import { DEFAULT_OUTREACH_POLICY, type OutreachDecision, type OutreachFacts } from "./policy";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-30T12:00:00.000Z");

function allowedDecision(): OutreachDecision {
  return evaluateOutreachGate(baseFacts(), DEFAULT_OUTREACH_POLICY);
}

function deniedDecision(): OutreachDecision {
  return evaluateOutreachGate(baseFacts({ outreachSentThisTurn: 1 }), DEFAULT_OUTREACH_POLICY);
}

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

const cleanDraft = {
  speaker: "tutor",
  text: "这份岗位投出去一周没有回音，要不要我帮你把简历里那条实习重写得更像产品岗？",
  suggestions: [{ kind: "offer_next_step", text: "重写这段实习" }],
};

describe("门内产出契约（FR-31）", () => {
  test("规则门不放行时，任何草稿都产不出可发的主动消息", () => {
    const result = buildOutreachProposal({ decision: deniedDecision(), draft: cleanDraft });
    expect(result.proposal).toBeNull();
    expect(result.violations).toEqual(["gate_denied"]);
  });

  test("干净草稿 → 导师身份、仅会话内、不自动发送、建议需确认", () => {
    const result = buildOutreachProposal({ decision: allowedDecision(), draft: cleanDraft });
    expect(result.violations).toEqual([]);
    const proposal = result.proposal!;
    expect(proposal).toMatchObject({
      kind: "proactive_outreach",
      speaker: "tutor",
      delivery: OUTREACH_DELIVERY,
      autoSend: false,
      gate: { allowed: true, stalledDays: 3 },
    });
    expect(proposal.suggestions).toEqual([
      { kind: "offer_next_step", text: "重写这段实习", requiresUserConfirmation: true, mutates: false },
    ]);
    expect(() => assertOutreachIsReadOnly(proposal)).not.toThrow();
  });

  test("草稿不写 speaker 时按导师身份补齐，不产生第二个身份", () => {
    const { speaker: _speaker, ...rest } = cleanDraft;
    const result = buildOutreachProposal({ decision: allowedDecision(), draft: rest });
    expect(result.proposal!.speaker).toBe("tutor");
  });

  const rejections: Array<{ name: string; draft: unknown; expectViolation: string }> = [
    { name: "冒充用户发第一句", draft: { ...cleanDraft, speaker: "user" }, expectViolation: "wrong_speaker" },
    { name: "role 写成用户", draft: { ...cleanDraft, speaker: undefined, role: "user" }, expectViolation: "wrong_speaker" },
    { name: "要求以用户身份代发", draft: { ...cleanDraft, sendAsUser: true }, expectViolation: "impersonates_user" },
    { name: "要求代替用户说话", draft: { ...cleanDraft, onBehalfOfUser: true }, expectViolation: "impersonates_user" },
    { name: "要求自动发送", draft: { ...cleanDraft, autoSend: true }, expectViolation: "auto_send_requested" },
    { name: "要求真实推送", draft: { ...cleanDraft, push: true }, expectViolation: "auto_send_requested" },
    { name: "要求直接改状态", draft: { ...cleanDraft, mutatesState: true }, expectViolation: "state_mutation_requested" },
    { name: "带写入目标字段", draft: { ...cleanDraft, applyTo: "opportunity_stage" }, expectViolation: "state_mutation_requested" },
    { name: "带补丁字段", draft: { ...cleanDraft, patch: { stage: "won" } }, expectViolation: "state_mutation_requested" },
    { name: "空正文", draft: { ...cleanDraft, text: "   " }, expectViolation: "empty_message" },
    { name: "超长正文", draft: { ...cleanDraft, text: "帮".repeat(OUTREACH_MAX_TEXT_CHARS + 1) }, expectViolation: "message_too_long" },
    { name: "正文不是字符串", draft: { ...cleanDraft, text: 123 }, expectViolation: "empty_message" },
    { name: "未知建议类型", draft: { ...cleanDraft, suggestions: [{ kind: "auto_apply", text: "直接投递" }] }, expectViolation: "unknown_suggestion_kind" },
    { name: "建议想跳过确认", draft: { ...cleanDraft, suggestions: [{ kind: "offer_next_step", text: "投递", skipConfirmation: true }] }, expectViolation: "state_mutation_requested" },
    { name: "建议声称已确认", draft: { ...cleanDraft, suggestions: [{ kind: "offer_next_step", text: "投递", confirmed: true }] }, expectViolation: "state_mutation_requested" },
    { name: "建议正文为空", draft: { ...cleanDraft, suggestions: [{ kind: "offer_next_step", text: "  " }] }, expectViolation: "empty_message" },
    { name: "草稿不是对象", draft: "直接发出去吧", expectViolation: "empty_message" },
  ];

  test.each(rejections)("$name → 整条丢弃", ({ draft, expectViolation }) => {
    const result = buildOutreachProposal({ decision: allowedDecision(), draft });
    expect(result.proposal).toBeNull();
    expect(result.violations).toContain(expectViolation);
  });

  test("建议条数超过上限时只截断，不放大成第二条主动消息", () => {
    const result = buildOutreachProposal({
      decision: allowedDecision(),
      draft: {
        ...cleanDraft,
        suggestions: OUTREACH_SUGGESTION_KINDS.slice(0, 3).map((kind) => ({ kind, text: `建议：${kind}` })),
      },
    });
    expect(result.violations).toEqual([]);
    expect(result.proposal!.suggestions).toHaveLength(2);
  });

  test("建议正文同样受长度上限约束", () => {
    const result = buildOutreachProposal({
      decision: allowedDecision(),
      draft: { ...cleanDraft, suggestions: [{ kind: "nudge_stage", text: "长".repeat(500) }] },
    });
    expect(result.proposal!.suggestions[0].text).toHaveLength(OUTREACH_MAX_TEXT_CHARS);
  });

  test("产出结构里不存在任何可写状态的字段", () => {
    const proposal = buildOutreachProposal({ decision: allowedDecision(), draft: cleanDraft }).proposal!;
    const keys = Object.keys(proposal).sort();
    expect(keys).toEqual(["autoSend", "delivery", "gate", "kind", "speaker", "suggestions", "text"]);
    // 建议项同样只允许这四个键，多一个都不行。
    expect(Object.keys(proposal.suggestions[0]).sort()).toEqual([
      "kind",
      "mutates",
      "requiresUserConfirmation",
      "text",
    ]);
  });

  test("违规码去重，同一条草稿不会把同一违规记两遍", () => {
    const result = buildOutreachProposal({
      decision: allowedDecision(),
      draft: {
        ...cleanDraft,
        suggestions: [
          { kind: "offer_next_step", text: "投递", applyNow: true },
          { kind: "nudge_stage", text: "推进", mutates: true },
        ],
      },
    });
    expect(result.violations).toEqual(["state_mutation_requested"]);
  });
});
