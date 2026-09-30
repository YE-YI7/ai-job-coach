/**
 * 守卫注册表（W1）。热路径唯一入口：registerGuard 挂载、runSlot 执行。
 *
 * 纪律（施工契约 §0-2）：守卫只有挂载点，没有特例。加一条守卫
 * 不改 app/api/coach/agent/route.ts，也不改其他守卫文件——
 * 这条由 registry.test.ts 用假守卫机械证明。
 */

import type { GuardDecision, GuardSlot } from "./types";
import { isGuardSlot } from "./types";

export interface GuardDefinition<I = any> {
  /** 稳定 id：台账、评测与「钉在哪一槽」断言都用它。 */
  id: string;
  /** 纯函数：同一输入同一裁决；不得触网、不得写库、不得改状态。 */
  run: (input: I) => GuardDecision;
}

const slots = new Map<GuardSlot, GuardDefinition[]>();

/** 注册进某一槽；同槽重复注册同 id 直接抛错。返回反注册函数。 */
export function registerGuard<I>(slot: GuardSlot, guard: GuardDefinition<I>): () => void {
  if (!isGuardSlot(slot)) throw new Error(`非法槽号 ${String(slot)}：守卫只能钉在 1–4`);
  if (!guard.id || typeof guard.run !== "function") throw new Error("守卫必须有 id 和 run(input)");
  const list = slots.get(slot) ?? [];
  if (list.some((item) => item.id === guard.id)) {
    throw new Error(`守卫 ${guard.id} 已在槽${slot}注册，不许重复挂载`);
  }
  list.push(guard as GuardDefinition);
  slots.set(slot, list);
  return () => {
    const current = slots.get(slot) ?? [];
    const index = current.findIndex((item) => item.id === guard.id);
    if (index >= 0) current.splice(index, 1);
  };
}

/**
 * 跑一个槽：按注册顺序返回全部裁决。守卫的裁决必须声明与注册槽一致的
 * slot——钉错槽位是装配事故，运行期直接炸，不容进台账。
 */
export function runSlot<I>(slot: GuardSlot, input: I): GuardDecision[] {
  if (!isGuardSlot(slot)) throw new Error(`非法槽号 ${String(slot)}：只有四个挂载槽`);
  return (slots.get(slot) ?? []).map((guard) => {
    const decision = guard.run(input);
    if (decision.slot !== slot) {
      throw new Error(`守卫 ${decision.guardId} 钉错槽位：注册在槽${slot}，裁决却声明槽${decision.slot}`);
    }
    return decision;
  });
}

/** 某槽当前挂载的守卫 id（按执行顺序）。 */
export function registeredGuardIds(slot: GuardSlot): string[] {
  return (slots.get(slot) ?? []).map((guard) => guard.id);
}

export function totalRegisteredGuards(): number {
  return [...slots.values()].reduce((sum, list) => sum + list.length, 0);
}

/** 只给测试做隔离用；生产装配走 registerDefaultGuards()（幂等）。 */
export function resetGuardRegistry(): void {
  slots.clear();
}
