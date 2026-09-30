/**
 * 槽4 落库后事件（设计文档 §5.3 槽4 / FR-21 的「判定不等于事实」半边）。
 *
 * 阶段意图建议：用户在对话里说出的真实动作（"我投了""约到二面了"）
 * 只产出 no_advance 建议裁决，推进与否由用户确认——纯函数、不触库、
 * 不调 updateRunStatus，结构上就没有推进能力。run() 想改状态也没有
 * 任何入参可改：输入是不可读回的字符串 + 当前阶段快照。
 */

import { advanceStage, inferStageIntent } from "../stage-intent";
import type { OpportunityStage } from "@/lib/opportunities/types";
import { type GuardDefinition } from "./registry";
import { decide, GUARD_SLOTS, type GuardDecision } from "./types";

export const STAGE_INTENT_GUARD_ID = "post.stage-intent-suggestion";

/** 槽4 的统一输入：落库完成后的回流材料。 */
export interface Slot4Input {
  /** 用户本轮原话。 */
  message?: string;
  /** 落库时该岗位的当前阶段快照（只读）。 */
  currentStage?: OpportunityStage;
}

export function stageIntentDecision(input: Slot4Input): GuardDecision {
  if (typeof input.message !== "string" || !input.message.trim() || !input.currentStage) {
    return decide(GUARD_SLOTS.postPersistenceEvent, STAGE_INTENT_GUARD_ID, "pass", "input_absent", "缺少原话或阶段快照，不产出建议。");
  }
  const intent = inferStageIntent(input.message);
  const suggestion = advanceStage(input.currentStage, intent);
  if (!suggestion) {
    return decide(
      GUARD_SLOTS.postPersistenceEvent,
      STAGE_INTENT_GUARD_ID,
      "pass",
      intent ? "no_stage_change_needed" : "no_stage_signal",
      intent ? "识别到的动作不高于当前阶段，不生成推进建议。" : "本轮没有可信的阶段动作信号。",
      { intent },
    );
  }
  return decide(
    GUARD_SLOTS.postPersistenceEvent,
    STAGE_INTENT_GUARD_ID,
    "no_advance",
    "stage_suggestion",
    `用户口述动作建议推进到「${suggestion}」，必须由用户确认后才写状态。`,
    { intent, suggestion, currentStage: input.currentStage },
  );
}

export const SLOT4_GUARDS: GuardDefinition[] = [
  { id: STAGE_INTENT_GUARD_ID, run: stageIntentDecision },
];
