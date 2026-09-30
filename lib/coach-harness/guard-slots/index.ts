/**
 * 护栏四槽装配入口（W1）。主链路将来只需要：
 *
 *   registerDefaultGuards();          // 应用启动时一次，幂等
 *   const decisions = runSlot(slot, input);
 *
 * 加一条守卫 = 在对应 *guards.ts 的 SLOTn_GUARDS 数组里添一项
 * （或任何时候 registerGuard），route.ts 与其他守卫文件都不用动。
 */

import { registerGuard, registeredGuardIds } from "./registry";
import type { GuardDefinition } from "./registry";
import { GUARD_SLOTS } from "./types";
import { SLOT1_GUARDS } from "./admission.guards";
import { SLOT2_GUARDS } from "./stream.guards";
import { SLOT3_GUARDS } from "./verification.guards";
import { SLOT4_GUARDS } from "./post-persistence.guards";

export * from "./types";
export * from "./registry";
export * from "./admission.guards";
export * from "./stream.guards";
export * from "./verification.guards";
export * from "./post-persistence.guards";

const GUARD_MANIFEST: ReadonlyArray<{ slot: 1 | 2 | 3 | 4; guards: GuardDefinition[] }> = [
  { slot: GUARD_SLOTS.postAssemblyAdmission, guards: SLOT1_GUARDS },
  { slot: GUARD_SLOTS.streamingSentence, guards: SLOT2_GUARDS },
  { slot: GUARD_SLOTS.prePersistenceVerification, guards: SLOT3_GUARDS },
  { slot: GUARD_SLOTS.postPersistenceEvent, guards: SLOT4_GUARDS },
];

/** 默认守卫的注册顺序（同槽内按此序执行）。 */
export const DEFAULT_GUARD_IDS: readonly string[] = GUARD_MANIFEST.flatMap((entry) => entry.guards.map((guard) => guard.id));

/** 幂等地把现有守卫按四槽装配；返回本次新注册的 id。 */
export function registerDefaultGuards(): string[] {
  const fresh: string[] = [];
  for (const { slot, guards } of GUARD_MANIFEST) {
    const mounted = registeredGuardIds(slot);
    for (const guard of guards) {
      if (mounted.includes(guard.id)) continue;
      registerGuard(slot, guard);
      fresh.push(guard.id);
    }
  }
  return fresh;
}
