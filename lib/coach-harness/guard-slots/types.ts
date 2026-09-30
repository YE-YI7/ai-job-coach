/**
 * 护栏归四槽（设计文档 §5.3 / 施工契约 W1）。
 *
 * 所有拦截 / 降级 / 标注都注册进四个固定槽位之一，统一返回 GuardDecision。
 * 主链路只调 runSlot(槽, 输入)，永远不逐个点名守卫——新增一条守卫
 * 只需要 registerGuard，不需要改 app/api/coach/agent/route.ts。
 */

export type GuardSlot = 1 | 2 | 3 | 4;

/** 四个挂载槽的语义名。槽号是评测断言「钉在哪一槽」的坐标，不许改序。 */
export const GUARD_SLOTS = {
  /** 槽1 装配后准入：材料够不够——该不该问、该不该降级、该不该拒绝。 */
  postAssemblyAdmission: 1,
  /** 槽2 流式逐句：生成中收敛——重复追问/逐字重复检测、逐句标注。 */
  streamingSentence: 2,
  /** 槽3 落库前核验：反幻觉与一致性——quote 回指、冲突确认、草稿校验。 */
  prePersistenceVerification: 3,
  /** 槽4 落库后事件：审计与回流——只出建议、只写事件，绝不推进状态。 */
  postPersistenceEvent: 4,
} as const satisfies Record<string, GuardSlot>;

export const GUARD_SLOT_NUMBERS: readonly GuardSlot[] = [1, 2, 3, 4];

/**
 * 五选一的统一裁决（PRD FR-20/21 的介入口径）。
 * 没有散装布尔字段：拦截/降级/标注/只建议，全部走这一个枚举。
 * - pass：放行。
 * - block：拦截（拒绝并追问 / 停止生成 / 不落库）。
 * - degrade_to_pending：降级为待确认（不当作用户事实，等用户点头）。
 * - annotate：放行但带标注（正文被守卫就地改写/加注释，需可见）。
 * - no_advance：只出建议、不推进（槽4 专用；其他槽不许产出这个）。
 */
export const GUARD_OUTCOMES = [
  "pass",
  "block",
  "degrade_to_pending",
  "annotate",
  "no_advance",
] as const;

export type GuardOutcome = (typeof GUARD_OUTCOMES)[number];

/** 理由 = 机器码（测试与遥测断言用） + 人话（台账与 UI 展示用）。 */
export interface GuardReason {
  code: string;
  message: string;
}

export interface GuardDecisionBase {
  /** 哪条守卫给的裁决（注册时的稳定 id）。 */
  guardId: string;
  /** 钉在哪一槽：评测用例据此精确回答「这条断言钉在哪一槽」。 */
  slot: GuardSlot;
  reason: GuardReason;
  /** 结构化附加信息（裁决后要用的正文、被拦材料、建议值、旧接口返回体）。
   *  只放数据，不放第二套判定布尔——判定语义全在 outcome 一个字段里。 */
  data?: Record<string, unknown>;
}

export interface PassDecision extends GuardDecisionBase { outcome: "pass" }
export interface BlockDecision extends GuardDecisionBase { outcome: "block" }
export interface DegradeToPendingDecision extends GuardDecisionBase { outcome: "degrade_to_pending" }
export interface AnnotateDecision extends GuardDecisionBase { outcome: "annotate" }
export interface NoAdvanceDecision extends GuardDecisionBase { outcome: "no_advance" }

export type GuardDecision =
  | PassDecision
  | BlockDecision
  | DegradeToPendingDecision
  | AnnotateDecision
  | NoAdvanceDecision;

export function isGuardSlot(value: unknown): value is GuardSlot {
  return (GUARD_SLOT_NUMBERS as readonly unknown[]).includes(value);
}

export function isGuardOutcome(value: unknown): value is GuardOutcome {
  return (GUARD_OUTCOMES as readonly unknown[]).includes(value);
}

/** 构造裁决；槽号与 outcome 写错在运行期直接炸，不悄悄混进台账。 */
export function decide(
  slot: GuardSlot,
  guardId: string,
  outcome: GuardOutcome,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): GuardDecision {
  if (!isGuardSlot(slot)) throw new Error(`非法槽号 ${String(slot)}：守卫只能钉在 1–4`);
  if (!isGuardOutcome(outcome)) throw new Error(`非法裁决 ${String(outcome)}：必须五选一`);
  if (!guardId) throw new Error("裁决必须带 guardId");
  const decision: GuardDecision = { outcome, slot, guardId, reason: { code, message } };
  if (data) decision.data = data;
  return decision;
}
