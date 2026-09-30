/**
 * 槽1 装配后准入（设计文档 §5.3 槽1 / FR-13、FR-21）：材料够不够。
 *
 * 四条守卫全是包装：容量断言直接调 assertContextFits（预算数字与
 * 拒绝语义都在 prompt.ts 里，本文件不复制一个字）；材料缺口分型直接
 * 调 summarizeMaterialGaps；简历 grounding 的准入半边直接调
 * needsResumeGrounding；提示词保护区直接读 compileTutorPrompt 的
 * mustKeepViolations（预算数字与砍料逻辑都在 materials.ts 里）。
 * runSlot 把槽输入整体发给每条守卫，取不到自己那份输入的守卫返回
 * pass(input_absent)。
 */

import { assertContextFits, ContextBudgetExceededError } from "../prompt";
import type { ContextBundle } from "../types";
import { summarizeMaterialGaps, type MaterialProbe } from "../material-gap";
import { needsResumeGrounding } from "../resume-grounding";
import { TUTOR_MATERIALS, type CompiledTutorPrompt } from "../materials";
import { type GuardDefinition } from "./registry";
import { decide, GUARD_SLOTS, type GuardDecision } from "./types";

export const CAPACITY_GUARD_ID = "admission.capacity";
export const MATERIAL_GAP_GUARD_ID = "admission.material-gap";
export const RESUME_ADMISSION_GUARD_ID = "admission.resume-grounding";
export const PROMPT_CAPACITY_GUARD_ID = "admission.prompt-capacity";

/** 槽1 的统一输入：编译后、发模型前的那一份材料盘点。 */
export interface Slot1Input {
  /** 装配产物；容量断言只看它，不重算预算。 */
  bundle?: ContextBundle;
  /** 本轮任务需要的材料探针（缺料分型）。 */
  probes?: MaterialProbe[];
  /** 用户本轮原话（grounding 准入判定）。 */
  message?: string;
  /** 提示词装配产物；保护区判定只看它，不再复算一次预算。 */
  prompt?: CompiledTutorPrompt;
}

/** 容量断言：关键料装不下 = 拒绝请求并说明缺什么，不降权硬答。 */
export function capacityAdmissionDecision(input: Slot1Input): GuardDecision {
  if (!input.bundle) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, CAPACITY_GUARD_ID, "pass", "input_absent", "本轮未提供装配产物。");
  }
  try {
    assertContextFits(input.bundle);
    return decide(GUARD_SLOTS.postAssemblyAdmission, CAPACITY_GUARD_ID, "pass", "context_fits", "关键材料都装进了预算。");
  } catch (error) {
    if (error instanceof ContextBudgetExceededError) {
      return decide(
        GUARD_SLOTS.postAssemblyAdmission,
        CAPACITY_GUARD_ID,
        "block",
        "context_budget_exceeded",
        error.message,
        { blocked: error.blocked, status: error.status },
      );
    }
    throw error;
  }
}

/** 材料缺口分型：只有「确认真的没有」才拒绝；读取/解析/关联问题给替代路径。 */
export function materialGapDecision(input: Slot1Input): GuardDecision {
  if (!input.probes) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, MATERIAL_GAP_GUARD_ID, "pass", "input_absent", "本轮未提供材料探针。");
  }
  const summary = summarizeMaterialGaps(input.probes);
  const base: Record<string, unknown> = {
    blocking: summary.blocking,
    recoverable: summary.recoverable,
    primaryRecovery: summary.primaryRecovery,
  };
  if (summary.blocking.length) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, MATERIAL_GAP_GUARD_ID, "block", "material_genuinely_missing", summary.headline ?? "缺少推进这一步的材料。", base);
  }
  if (summary.recoverable.length) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, MATERIAL_GAP_GUARD_ID, "annotate", "material_recoverable_gap", summary.headline ?? "材料有可恢复问题，不阻断本轮。", base);
  }
  return decide(GUARD_SLOTS.postAssemblyAdmission, MATERIAL_GAP_GUARD_ID, "pass", "materials_sufficient", "材料齐备。", base);
}

/** 简历 grounding 的准入半边：要代写对外经历 → 本轮改走事实复核链路。 */
export function resumeGroundingAdmissionDecision(input: Slot1Input): GuardDecision {
  if (typeof input.message !== "string") {
    return decide(GUARD_SLOTS.postAssemblyAdmission, RESUME_ADMISSION_GUARD_ID, "pass", "input_absent", "本轮未提供用户原话。");
  }
  return needsResumeGrounding(input.message)
    ? decide(GUARD_SLOTS.postAssemblyAdmission, RESUME_ADMISSION_GUARD_ID, "annotate", "resume_grounding_required", "本轮涉及代写对外经历，先走简历事实复核链路。")
    : decide(GUARD_SLOTS.postAssemblyAdmission, RESUME_ADMISSION_GUARD_ID, "pass", "general_consult", "普通咨询，不触发简历复核。");
}

/** 槽1 的统一装配护栏：保护区（必留料）装不下 = 本轮不许出请求。 */
export function promptCapacityAdmissionDecision(input: Slot1Input): GuardDecision {
  if (!input.prompt) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, PROMPT_CAPACITY_GUARD_ID, "pass", "input_absent", "本轮未提供提示词装配产物。");
  }
  const violations = input.prompt.mustKeepViolations;
  if (!violations.length) {
    return decide(GUARD_SLOTS.postAssemblyAdmission, PROMPT_CAPACITY_GUARD_ID, "pass", "protected_materials_fit", "保护区材料全部装进本轮预算。");
  }
  // 只点名后到者：谁把谁挤掉了由编译器一次决定，这里不重算。
  const labels = [...new Set(violations.map((v) => v.kind === "system_and_question" ? "当前问题与系统约束" : TUTOR_MATERIALS[v.kind].label))].join("、");
  const kinds = violations.map((v) => v.kind);
  const resumeGrounding = kinds.includes("resume_sources");
  const message = resumeGrounding
    ? `材料较长，请分段提交简历经历（${labels}装不进本轮预算）`
    : `本轮材料超出预算：${labels}。请拆分问题，或指定要保留哪份材料。`;
  return decide(GUARD_SLOTS.postAssemblyAdmission, PROMPT_CAPACITY_GUARD_ID, "block", "prompt_must_keep_exceeds_budget", message, {
    kinds,
    budgetTokens: input.prompt.budgetTokens,
    // 400 = 这一轮的输入需要用户改，不是服务器坏了。
    status: 400,
  });
}

export const SLOT1_GUARDS: GuardDefinition[] = [
  { id: CAPACITY_GUARD_ID, run: capacityAdmissionDecision },
  { id: MATERIAL_GAP_GUARD_ID, run: materialGapDecision },
  { id: RESUME_ADMISSION_GUARD_ID, run: resumeGroundingAdmissionDecision },
  { id: PROMPT_CAPACITY_GUARD_ID, run: promptCapacityAdmissionDecision },
];
