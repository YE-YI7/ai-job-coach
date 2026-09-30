/**
 * 槽2 流式逐句（设计文档 §5.3 槽2 / FR-20）：生成中的收敛守卫。
 *
 * - repetition-abort：逐字重复检测。原来内联在 tutor-stream 的循环，
 *   这里原样搬出成守卫（阈值与算法一字不改：size 40–600、尾巴去空白
 *   ≥30 字、连续三份相同后缀）。tutor-stream 反手调用本函数，命中
 *   block 裁决时抛出与迁移前逐字节相同的错误——错误文案进失败语义表
 *   （chat-failure 的 repetition_abort 行），不再散账。
 * - sentence-admission：逐句跑信息不足守卫（复用 guardInsufficientReply，
 *   槽2 语义版映射，与槽3 同一张映射表）。
 */

import { guardInsufficientReply } from "../insufficiency-guard";
import { type GuardDefinition } from "./registry";
import { decide, GUARD_SLOTS, type GuardDecision } from "./types";
import { insufficiencyDecision } from "./verification.guards";

export const REPETITION_GUARD_ID = "stream.repetition-abort";
export const SENTENCE_GUARD_ID = "stream.sentence-admission";

/** 与迁移前 route/tutor-stream 抛出的错误逐字相同，前端与遥测口径不动。 */
export const REPETITION_ABORT_MESSAGE = "导师输出重复，已停止本次回答，请重试";

/** 槽2 的统一输入。 */
export interface Slot2Input {
  /** 已累积的原始流文本（重复检测用）。 */
  raw?: string;
  /** 一个完整句（逐句准入门禁用）。 */
  sentence?: { text: string; userText?: string };
}

/** 纯函数：给累积文本，判是否已进入「三段以上逐字重复」。 */
export function repetitionAbortDecision(raw: string): GuardDecision {
  for (let size = 40; size <= Math.min(600, Math.floor(raw.length / 3)); size++) {
    const tail = raw.slice(-size);
    if (tail.trim().length >= 30 && raw.endsWith(tail.repeat(3))) {
      return decide(GUARD_SLOTS.streamingSentence, REPETITION_GUARD_ID, "block", "repetition_detected", REPETITION_ABORT_MESSAGE, { sample: tail });
    }
  }
  return decide(GUARD_SLOTS.streamingSentence, REPETITION_GUARD_ID, "pass", "no_repetition", "未检测到逐字重复。");
}

/** 逐句守卫：与槽3 用同一 guardInsufficientReply / 同一映射，只是钉在槽2。 */
export function sentenceAdmissionDecision(input: Slot2Input): GuardDecision {
  if (!input.sentence) {
    return decide(GUARD_SLOTS.streamingSentence, SENTENCE_GUARD_ID, "pass", "input_absent", "本输入未携带整句。");
  }
  const result = guardInsufficientReply({ answer: input.sentence.text, userText: input.sentence.userText ?? "" });
  return insufficiencyDecision(result, SENTENCE_GUARD_ID, GUARD_SLOTS.streamingSentence);
}

function repetitionGuardRun(input: Slot2Input): GuardDecision {
  return repetitionAbortDecision(typeof input.raw === "string" ? input.raw : "");
}

export const SLOT2_GUARDS: GuardDefinition[] = [
  { id: REPETITION_GUARD_ID, run: repetitionGuardRun },
  { id: SENTENCE_GUARD_ID, run: sentenceAdmissionDecision },
];
