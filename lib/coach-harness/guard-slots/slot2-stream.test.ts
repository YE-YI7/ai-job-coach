/**
 * 槽2 流式逐句：重复追问/逐字重复检测 + 逐句准入。
 * 每条断言钉在 slot===2，并证明 tutor-stream 迁移前后逐字同行为。
 */

import { createTutorStream } from "../tutor-stream";
import {
  REPETITION_GUARD_ID,
  REPETITION_ABORT_MESSAGE,
  SENTENCE_GUARD_ID,
  registerDefaultGuards,
  repetitionAbortDecision,
  resetGuardRegistry,
  runSlot,
  sentenceAdmissionDecision,
  type Slot2Input,
} from "./index";

afterEach(() => resetGuardRegistry());

const REPEATED = "这是一段反复重新开头而没有继续解释概念的文字，需要阻止模型一直不停地重复输出同样的内容。";

describe("槽2 repetition-abort（从 tutor-stream 原样搬出）", () => {
  test("这条断言钉在槽2", () => {
    registerDefaultGuards();
    const decisions = runSlot<Slot2Input>(2, { raw: "普通回答。" });
    expect(decisions.every((d) => d.slot === 2)).toBe(true);
    expect(decisions.map((d) => d.guardId)).toContain(REPETITION_GUARD_ID);
  });
  test("三段以上逐字重复 → block，错误文案与迁移前逐字相同", () => {
    const d = repetitionAbortDecision("<answer>" + REPEATED.repeat(3));
    expect(d.slot).toBe(2);
    expect(d.guardId).toBe(REPETITION_GUARD_ID);
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("repetition_detected");
    expect(d.reason.message).toBe("导师输出重复，已停止本次回答，请重试");
    expect(d.reason.message).toBe(REPETITION_ABORT_MESSAGE);
  });
  test("正常短重复不拦（行为与原内联循环一致）", () => {
    expect(repetitionAbortDecision("<answer>好。好。好。").outcome).toBe("pass");
  });
  test("tutor-stream 仍然抛出同一句话（迁移不改调用方）", () => {
    const push = createTutorStream("", () => {});
    expect(() => push("<answer>" + REPEATED.repeat(3))).toThrow(REPETITION_ABORT_MESSAGE);
    expect(() => push("<answer>好。好。好。")).not.toThrow();
  });
});

describe("槽2 sentence-admission（逐句跑信息不足守卫）", () => {
  test("无依据断言句 → annotate，正文降级为待确认", () => {
    const d = sentenceAdmissionDecision({ sentence: { text: "你已经掌握了。" } });
    expect(d.slot).toBe(2);
    expect(d.guardId).toBe(SENTENCE_GUARD_ID);
    expect(d.outcome).toBe("annotate");
    expect(d.reason.code).toBe("unconfirmed_claims_hedged");
    expect((d.data as { answer: string }).answer).toContain("（待你确认）");
  });
  test("blocking 澄清句 → block（生成中收敛）", () => {
    const d = sentenceAdmissionDecision({ sentence: { text: '<clarify level="blocking">你投的是哪个岗位？</clarify>' } });
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("insufficient_blocking");
  });
  test("普通教学句 → pass", () => {
    expect(sentenceAdmissionDecision({ sentence: { text: "指标拆解先定口径。" } }).outcome).toBe("pass");
  });
  test("没有整句输入不猜测：pass(input_absent)", () => {
    expect(sentenceAdmissionDecision({ raw: "半句" }).reason.code).toBe("input_absent");
  });
});
