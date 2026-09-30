/**
 * W5 / PRD FR-30 + FR-31 的编排入口：门 → （只在门内）模型 → 产出校验。
 *
 * 关键纪律：`draft` 只有在规则门放行时才会被调用。
 * 「模型决定说什么」发生在门里面，不是门外面，
 * 这条在本目录的 outreach.test.ts 里用「门拒绝时 draft 调用次数必须为 0」钉住。
 */

import { evaluateOutreachGate } from "./gate";
import {
  assertOutreachIsReadOnly,
  buildOutreachProposal,
  type OutreachProposal,
  type OutreachViolation,
} from "./proposal";
import {
  DEFAULT_OUTREACH_POLICY,
  type OutreachDecision,
  type OutreachFacts,
  type OutreachPolicy,
} from "./policy";

export interface OutreachDraftContext {
  decision: OutreachDecision;
  /** 门算出来的停滞天数，模型可用它措辞，但不参与是否放行。 */
  stalledDays: number | null;
}

export type OutreachDraft = (context: OutreachDraftContext) => unknown | Promise<unknown>;

/** 主动触达判定的埋点记录：只有元数据，绝不含消息正文。 */
export interface OutreachAuditRecord {
  userId?: string;
  sessionId?: string | null;
  turnId?: string | null;
  allowed: boolean;
  blockedBy: OutreachDecision["blockedBy"];
  violations: OutreachViolation[];
  stalledDays: number | null;
  evaluatedAt: string;
  /** 是否真的产出了一条可发的主动消息。 */
  produced: boolean;
}

export type OutreachAuditSink = (record: OutreachAuditRecord) => void | Promise<void>;

export interface OutreachOutcome {
  decision: OutreachDecision;
  proposal: OutreachProposal | null;
  violations: OutreachViolation[];
  /** 模型是否被调用（门拒绝时必须为 false）。 */
  draftInvoked: boolean;
}

export interface RequestOutreachInput {
  facts: OutreachFacts;
  policy?: OutreachPolicy;
  draft: OutreachDraft;
}

export async function requestOutreach(input: RequestOutreachInput): Promise<OutreachOutcome> {
  const policy = input.policy ?? DEFAULT_OUTREACH_POLICY;
  const decision = evaluateOutreachGate(input.facts, policy);
  if (!decision.allowed) {
    // 不放行时连模型都不叫：省一次推理，也让「门说了算」可被测试证明。
    return { decision, proposal: null, violations: [], draftInvoked: false };
  }

  const draft = await input.draft({ decision, stalledDays: decision.stalledDays });
  const built = buildOutreachProposal({ decision, draft });
  if (built.proposal) {
    try {
      assertOutreachIsReadOnly(built.proposal);
    } catch {
      // 不变量破了就整条丢弃，绝不发半条。
      return {
        decision,
        proposal: null,
        violations: [...new Set<OutreachViolation>([...built.violations, "state_mutation_requested"])],
        draftInvoked: true,
      };
    }
  }
  return {
    decision,
    proposal: built.proposal,
    violations: built.violations,
    draftInvoked: true,
  };
}

/** 频控台账：本轮/今日计数与上次触达时间，由调用方按会话持有。 */
export interface OutreachCadence {
  turnId: string;
  outreachSentThisTurn: number;
  outreachTodayCount: number;
  lastOutreachAt: string | null;
}

export function createCadence(turnId: string, outreachTodayCount = 0, lastOutreachAt: string | null = null): OutreachCadence {
  return { turnId, outreachSentThisTurn: 0, outreachTodayCount, lastOutreachAt };
}

/**
 * 一次判定写回频控状态。
 * 新一轮（turnId 变化）时本轮计数清零；跨日由调用方按自然日重置今日计数。
 */
export function applyOutreachCadence(
  cadence: OutreachCadence,
  input: { turnId: string; at: string; produced: boolean },
): OutreachCadence {
  const sameTurn = cadence.turnId === input.turnId;
  return {
    turnId: input.turnId,
    outreachSentThisTurn: sameTurn ? cadence.outreachSentThisTurn : 0,
    outreachTodayCount: cadence.outreachTodayCount,
    lastOutreachAt: input.produced ? input.at : cadence.lastOutreachAt,
  };
}

/**
 * 真正发出了一条主动消息后把频控台账推进一步：
 * 本轮计数 +1、今日计数 +1、记录上次触达时间。
 */
export function commitOutreach(cadence: OutreachCadence, at: string): OutreachCadence {
  return {
    ...cadence,
    outreachSentThisTurn: cadence.outreachSentThisTurn + 1,
    outreachTodayCount: cadence.outreachTodayCount + 1,
    lastOutreachAt: at,
  };
}

/** 把频控状态并入下一轮规则门的输入。 */
export function mergeCadenceIntoFacts(facts: OutreachFacts, cadence: OutreachCadence): OutreachFacts {
  return {
    ...facts,
    outreachSentThisTurn: facts.outreachSentThisTurn ?? cadence.outreachSentThisTurn,
    outreachTodayCount: facts.outreachTodayCount ?? cadence.outreachTodayCount,
    lastOutreachAt: facts.lastOutreachAt ?? cadence.lastOutreachAt,
  };
}

export async function recordOutreachDecision(
  sink: OutreachAuditSink | undefined,
  outcome: OutreachOutcome,
  meta: { userId?: string; sessionId?: string | null; turnId?: string | null } = {},
): Promise<void> {
  if (!sink) return;
  await sink({
    userId: meta.userId,
    sessionId: meta.sessionId ?? null,
    turnId: meta.turnId ?? null,
    allowed: outcome.decision.allowed,
    blockedBy: outcome.decision.blockedBy,
    violations: outcome.violations,
    stalledDays: outcome.decision.stalledDays,
    evaluatedAt: outcome.decision.evaluatedAt,
    produced: outcome.proposal !== null,
  });
}
