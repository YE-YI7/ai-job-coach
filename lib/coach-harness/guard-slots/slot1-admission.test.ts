/**
 * 槽1 装配后准入：每条断言都钉在 slot===1。
 * 容量断言 / 材料缺口分型 / 简历 grounding 准入半边——全部行为不变包装。
 */

import type { ContextBundle } from "../types";
import { summarizeMaterialGaps, type MaterialProbe } from "../material-gap";
import {
  CAPACITY_GUARD_ID,
  MATERIAL_GAP_GUARD_ID,
  RESUME_ADMISSION_GUARD_ID,
  capacityAdmissionDecision,
  materialGapDecision,
  registerDefaultGuards,
  resetGuardRegistry,
  runSlot,
  type Slot1Input,
} from "./index";

afterEach(() => resetGuardRegistry());

/** 手工构造最小 bundle：只依赖 assertContextFits 读取的三个字段，不复制预算数字。 */
function truncatedBundle(maxInputTokens: number): ContextBundle {
  return {
    usage: { truncated: true },
    selection: {
      included: [],
      excluded: [{ kind: "opportunity", refId: "job-1", cost: maxInputTokens * 2, reason: "budget_exhausted" }],
    },
    budget: { maxInputTokens },
  } as unknown as ContextBundle;
}

function fitsBundle(): ContextBundle {
  return {
    usage: { truncated: false },
    selection: { included: [], excluded: [] },
    budget: { maxInputTokens: 12000 },
  } as unknown as ContextBundle;
}

describe("槽1 capacity 守卫（装配后准入 · 容量断言）", () => {
  test("这条断言钉在槽1：runSlot(1,…) 的每条裁决 slot===1", () => {
    registerDefaultGuards();
    const decisions = runSlot<Slot1Input>(1, { bundle: fitsBundle() });
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((d) => d.slot === 1)).toBe(true);
  });
  test("装得下 → pass(context_fits)", () => {
    const d = capacityAdmissionDecision({ bundle: fitsBundle() });
    expect(d.slot).toBe(1);
    expect(d.guardId).toBe(CAPACITY_GUARD_ID);
    expect(d.outcome).toBe("pass");
    expect(d.reason.code).toBe("context_fits");
  });
  test("关键料装不下 → block，理由与被包装的 assertContextFits 逐字同源", () => {
    const bundle = truncatedBundle(500);
    const d = capacityAdmissionDecision({ bundle });
    expect(d.slot).toBe(1);
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("context_budget_exceeded");
    expect(d.reason.message).toContain("装不进 500 token 预算");
    expect((d.data as { blocked: unknown[] }).blocked).toHaveLength(1);
    expect((d.data as { status: number }).status).toBe(422);
  });
  test("没有装配产物时不猜测：pass(input_absent)", () => {
    expect(capacityAdmissionDecision({}).reason.code).toBe("input_absent");
  });
});

describe("槽1 material-gap 守卫（材料缺口分型）", () => {
  const missingResume: MaterialProbe = {
    material: "resume",
    sourceExists: false,
    contentLength: 0,
    parse: { status: "ok" },
  };
  const parseFailed: MaterialProbe = {
    material: "jd",
    sourceExists: true,
    contentLength: 800,
    parse: { status: "failed", reason: "扫描件" },
  };
  test("确认真缺 → block（拒绝并追问），话术与 summarizeMaterialGaps 同源", () => {
    const d = materialGapDecision({ probes: [missingResume] });
    expect(d.slot).toBe(1);
    expect(d.guardId).toBe(MATERIAL_GAP_GUARD_ID);
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("material_genuinely_missing");
    expect(d.reason.message).toBe(summarizeMaterialGaps([missingResume]).headline!);
  });
  test("解析失败不索要重传 → annotate（有替代路径，不阻断）", () => {
    const d = materialGapDecision({ probes: [parseFailed] });
    expect(d.outcome).toBe("annotate");
    expect(d.reason.code).toBe("material_recoverable_gap");
    expect(d.reason.message).toContain("换一种格式");
    expect(d.reason.message).not.toContain("重新上传同一份");
  });
  test("材料齐备 → pass", () => {
    const ok: MaterialProbe = { material: "resume", sourceExists: true, contentLength: 900, parse: { status: "ok" } };
    expect(materialGapDecision({ probes: [ok] }).outcome).toBe("pass");
  });
});

describe("槽1 resume-grounding 准入半边", () => {
  test("要代写对外经历 → annotate(resume_grounding_required)，不拦截普通咨询", () => {
    const d = materialGapAndResume("帮我把简历里这段项目描述改写一版");
    expect(d.slot).toBe(1);
    expect(d.guardId).toBe(RESUME_ADMISSION_GUARD_ID);
    expect(d.outcome).toBe("annotate");
    expect(d.reason.code).toBe("resume_grounding_required");
  });
  test("普通咨询 → pass(general_consult)", () => {
    const d = materialGapAndResume("STAR 法则怎么用？");
    expect(d.outcome).toBe("pass");
    expect(d.reason.code).toBe("general_consult");
  });
});

function materialGapAndResume(message: string) {
  // 取 runSlot 里 grounding 准入那条裁决（同槽三条各取所需）。
  registerDefaultGuards();
  const decisions = runSlot<Slot1Input>(1, { message });
  const found = decisions.find((d) => d.guardId === RESUME_ADMISSION_GUARD_ID);
  if (!found) throw new Error("准入守卫未挂载");
  return found;
}
