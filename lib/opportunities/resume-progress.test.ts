import { resumeProgress } from "./timeline";
import type { Opportunity } from "./types";

const opportunity = (extra: Partial<Opportunity> = {}) =>
  ({ stage: "captured", resumeChanges: [], requirements: [], ...extra }) as Opportunity;
const change = (status: "pending" | "accepted") => ({ status } as Opportunity["resumeChanges"][number]);
const qualityReady = { artifactId: "a", version: 1, status: "ready" as const, reviews: [] };
const frozenSnapshot = [{ id: "s-1", snapshotType: "submitted_resume" as const, version: 2, title: "投递简历", frozenAt: new Date().toISOString() }];

/**
 * 简历线去重后的唯一状态源：一条进度条 + 一个「当前动作」。
 * 锁死两个回归点：同一屏不能再冒出第二个动作；冻结后进度不回退。
 */
test("没有建议时停在「生成」，检查/冻结/导出都不出现", () => {
  const progress = resumeProgress(opportunity());
  expect(progress.action).toBe("generate");
  expect(progress.steps.map((step) => step.state)).toEqual(["waiting", "waiting", "waiting"]);
});

test("有待确认建议：动作只有 confirm，检查要等确认完", () => {
  const progress = resumeProgress(opportunity({
    resumeChanges: [change("pending"), change("accepted")],
    applicationQuality: qualityReady,
  }));
  expect(progress.action).toBe("confirm");
  expect(progress.pending).toBe(1);
  expect(progress.steps.map((step) => step.state)).toEqual(["active", "waiting", "waiting"]);
});

test("建议确认完、质检未通过：动作是 check", () => {
  const progress = resumeProgress(opportunity({ resumeChanges: [change("accepted")] }));
  expect(progress.action).toBe("check");
  expect(progress.steps.map((step) => step.state)).toEqual(["done", "active", "waiting"]);
});

test("质检 ready 且无待确认：动作变成 freeze", () => {
  const progress = resumeProgress(opportunity({ resumeChanges: [change("accepted")], applicationQuality: qualityReady }));
  expect(progress.action).toBe("freeze");
  expect(progress.steps.map((step) => step.state)).toEqual(["done", "done", "active"]);
});

test("冻结后动作是 export；再改建议回到 confirm，但已冻结状态不回退", () => {
  const frozen = resumeProgress(opportunity({
    resumeChanges: [change("accepted")],
    applicationQuality: qualityReady,
    snapshots: frozenSnapshot,
  }));
  expect(frozen.action).toBe("export");
  expect(frozen.frozenVersion).toBe(2);
  const edited = resumeProgress(opportunity({
    resumeChanges: [change("accepted"), change("pending")],
    applicationQuality: qualityReady,
    snapshots: frozenSnapshot,
  }));
  expect(edited.action).toBe("confirm");
  expect(edited.frozenVersion).toBe(2);
  expect(edited.steps[2].state).toBe("done");
});
