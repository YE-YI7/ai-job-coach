/**
 * 槽4 落库后事件：阶段意图建议必须「只建议、不推进」。
 * 每条断言钉在 slot===4，且结构上证明守卫没有推进能力。
 */

import { advanceStage, inferStageIntent } from "../stage-intent";
import type { OpportunityStage } from "@/lib/opportunities/types";
import {
  STAGE_INTENT_GUARD_ID,
  registerDefaultGuards,
  resetGuardRegistry,
  runSlot,
  stageIntentDecision,
  type Slot4Input,
} from "./index";

afterEach(() => resetGuardRegistry());

describe("槽4 stage-intent 建议守卫", () => {
  test("这条断言钉在槽4：runSlot(4,…) 全部裁决 slot===4", () => {
    registerDefaultGuards();
    const decisions = runSlot<Slot4Input>(4, { message: "我昨天把简历投出去了", currentStage: "captured" });
    expect(decisions.every((d) => d.slot === 4)).toBe(true);
  });
  test("口述真实动作 → no_advance + 建议值，绝不产出 block 之外的状态写回", () => {
    const d = stageIntentDecision({ message: "我昨天投了字节", currentStage: "captured" });
    expect(d.slot).toBe(4);
    expect(d.guardId).toBe(STAGE_INTENT_GUARD_ID);
    expect(d.outcome).toBe("no_advance");
    expect(d.reason.code).toBe("stage_suggestion");
    expect((d.data as { suggestion: OpportunityStage }).suggestion).toBe("applied");
    expect((d.data as { currentStage: OpportunityStage }).currentStage).toBe("captured");
  });
  test("求教/假设句不生成建议 → pass(no_stage_signal)", () => {
    const d = stageIntentDecision({ message: "如果我投了简历，HR 会怎么想？", currentStage: "captured" });
    expect(d.outcome).toBe("pass");
    expect(d.reason.code).toBe("no_stage_signal");
  });
  test("动作不高于当前阶段 → pass(no_stage_change_needed)", () => {
    expect(stageIntentDecision({ message: "我上周投过简历了", currentStage: "interviewing" }).reason.code).toBe("no_stage_change_needed");
  });
  test("缺输入不猜测 → pass(input_absent)", () => {
    expect(stageIntentDecision({ message: "我投了" }).reason.code).toBe("input_absent");
  });
  test("守卫是纯函数：不改动传入对象，裁决集合永远只有 pass / no_advance（没有推进权限）", () => {
    const inputs: Array<{ message: string; currentStage: OpportunityStage }> = [
      { message: "我投了字节", currentStage: "captured" },
      { message: "约到二面了", currentStage: "applied" },
      { message: "在谈薪了", currentStage: "interviewing" },
      { message: "今天天气如何", currentStage: "captured" },
      { message: "", currentStage: "captured" },
    ];
    const snapshot = JSON.parse(JSON.stringify(inputs));
    for (const input of inputs) {
      const d = stageIntentDecision(input);
      expect(["pass", "no_advance"]).toContain(d.outcome);
      // 与 stage-intent 纯函数结论一致：守卫不引入第二套判定。
      const suggestion = advanceStage(input.currentStage!, inferStageIntent(input.message));
      expect((d.data as { suggestion?: OpportunityStage } | undefined)?.suggestion ?? null).toBe(suggestion);
    }
    expect(inputs).toEqual(snapshot);
  });
});
