/**
 * 注册表机制 + W1 验收判据：
 * 「新增一条 guard 不需要改主链路」——用一个测试假守卫机械证明。
 */

import fs from "node:fs";
import path from "node:path";
import {
  decide,
  registerDefaultGuards,
  registerGuard,
  registeredGuardIds,
  resetGuardRegistry,
  runSlot,
  totalRegisteredGuards,
  DEFAULT_GUARD_IDS,
} from "./index";

afterEach(() => resetGuardRegistry());

describe("guard registry", () => {
  test("runSlot 按注册顺序返回有序裁决", () => {
    registerGuard(1, { id: "a", run: () => decide(1, "a", "pass", "a_pass", "A") });
    registerGuard(1, { id: "b", run: () => decide(1, "b", "annotate", "b_note", "B") });
    const decisions = runSlot(1, {});
    expect(decisions.map((d) => d.guardId)).toEqual(["a", "b"]);
    expect(decisions.map((d) => d.outcome)).toEqual(["pass", "annotate"]);
  });
  test("空槽返回空数组，不报错", () => {
    expect(runSlot(3, {})).toEqual([]);
  });
  test("钉错槽位当场炸：注册在槽1 的守卫交出 slot=2 的裁决", () => {
    registerGuard(1, { id: "misplaced", run: () => decide(2, "misplaced", "pass", "x", "钉错了") });
    expect(() => runSlot(1, {})).toThrow(/钉错槽位/);
  });
  test("同槽重复注册同一 id 被拒", () => {
    registerGuard(2, { id: "dup", run: () => decide(2, "dup", "pass", "x", "…") });
    expect(() => registerGuard(2, { id: "dup", run: () => decide(2, "dup", "pass", "x", "…") })).toThrow(/重复挂载|已在槽/);
  });
  test("registerGuard 返回反注册函数", () => {
    const off = registerGuard(4, { id: "temp", run: () => decide(4, "temp", "pass", "x", "…") });
    expect(registeredGuardIds(4)).toEqual(["temp"]);
    off();
    expect(registeredGuardIds(4)).toEqual([]);
  });
  test("非法槽号被拒", () => {
    expect(() => registerGuard(5 as 1, { id: "nope", run: () => decide(1, "nope", "pass", "x", "…") })).toThrow(/非法槽号/);
  });
});

describe("默认装配（现有守卫归位）", () => {
  test("registerDefaultGuards 幂等，装配十条（六条在岗守卫 + 槽3 两条可暴露项 + 槽2 逐句项）", () => {
    expect(registerDefaultGuards().length).toBe(DEFAULT_GUARD_IDS.length);
    expect(registerDefaultGuards()).toEqual([]); // 第二次一件都不新注册
    expect(totalRegisteredGuards()).toBe(DEFAULT_GUARD_IDS.length);
    // 契约点名的现有守卫全部在册
    for (const id of [
      "admission.capacity",
      "admission.material-gap",
      "admission.resume-grounding",
      "stream.repetition-abort",
      "verify.insufficiency",
      "post.stage-intent-suggestion",
      // 归位待接线（行为不变、可暴露）
      "verify.resume-grounding",
      "verify.claim-conflicts",
      "verify.artifact-draft",
      "stream.sentence-admission",
    ]) {
      expect(DEFAULT_GUARD_IDS).toContain(id);
    }
  });
});

describe("验收判据：新增一条 guard 不改主链路", () => {
  test("假守卫只经 registerGuard 挂载即可参与 runSlot，且任何现有实现文件都不认识它", () => {
    registerDefaultGuards();
    const fakeId = "admission.tokenpay-quota-preflight-FAKE-7TH";
    // 唯一动作：注册。除此之外本轮没有、也不允许改任何文件。
    registerGuard(1, {
      id: fakeId,
      run: () => decide(1, fakeId, "annotate", "fake_reason", "验收用假守卫：不参与真实判定。"),
    });
    const decisions = runSlot(1, { message: "随便聊聊" });
    expect(decisions.map((d) => d.guardId)).toContain(fakeId);
    expect(decisions.at(-1)?.guardId).toBe(fakeId); // 注册序最后，有序执行
    expect(decisions.every((d) => d.slot === 1)).toBe(true);

    // 机械证明：主链路与全部既有守卫文件里都不含这条假守卫——
    // 它能生效完全是因为 registry 允许挂载，不是因为谁被改了。
    const repoRoot = path.resolve(__dirname, "../../..");
    const watched = [
      "app/api/coach/agent/route.ts",
      "lib/coach-harness/insufficiency-guard.ts",
      "lib/coach-harness/tutor-stream.ts",
      "lib/coach-harness/chat-failure.ts",
      "lib/coach-harness/prompt.ts",
      "lib/coach-harness/context.ts",
      "lib/coach-harness/material-gap.ts",
      "lib/coach-harness/resume-grounding.ts",
      "lib/coach-harness/consistency.ts",
      "lib/coach-harness/stage-intent.ts",
      "lib/coach-harness/guard-slots/admission.guards.ts",
      "lib/coach-harness/guard-slots/stream.guards.ts",
      "lib/coach-harness/guard-slots/verification.guards.ts",
      "lib/coach-harness/guard-slots/post-persistence.guards.ts",
    ];
    for (const file of watched) {
      const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
      expect(source.includes(fakeId)).toBe(false);
    }
  });
});
