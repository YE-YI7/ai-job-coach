/**
 * PRD FR-35：多步任务生命周期。
 * 重点验两件事：
 *  1. 关页面后（没有前端信令）任务状态与半成品仍然可查、会被落成终态；
 *  2. 每一次迁移都经过 repository 的 createCoachRun / updateRunStatus，
 *     也就是把设计文档点名的「审计链空转」重新接上。
 */

jest.mock("@/lib/db");

import { getDbClient } from "@/lib/db";
import { createCoachRun, updateRunStatus } from "../repository";
import type { ContextBundle } from "../types";
import {
  beginStep,
  cancelTask,
  completeStep,
  completeTask,
  deriveSteps,
  deriveTaskStatus,
  failTask,
  getTaskLedger,
  listActiveRuns,
  listTaskLedgers,
  reconcileStaleTasks,
  resumeTask,
  startExecution,
  startTask,
  waitForUser,
} from "./lifecycle";
import { FakeDb } from "./testing/fake-db";

const USER = "00000000-0000-4000-8000-000000000001";
const OPP = "00000000-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-09-30T12:00:00.000Z");

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  (getDbClient as jest.Mock).mockImplementation(async () => db);
});

const context = {
  version: 2,
  task: "job_decision",
  userId: USER,
  intent: "找 20 个对口的 agent 产品岗",
  planVersion: null,
  selectedOpportunityIds: [],
  deadline: null,
  userOverride: false,
  budget: { routeClass: "bounded_orchestration", maxInputTokens: 12_000, maxModelCalls: 3, maxToolCalls: 6 },
  selection: { included: [], excluded: [] },
  usage: { usedTokens: 8_000, truncated: false },
  fingerprint: "abc123abc123",
} as unknown as ContextBundle;

const STEPS = [
  { id: "collect", label: "收集候选岗位" },
  { id: "screen", label: "硬筛地点/年限" },
  { id: "rank", label: "排序并给理由" },
];

async function newTask(overrides: Record<string, unknown> = {}) {
  return startTask({
    userId: USER,
    task: "job_decision",
    goal: "跑一次岗位搜索",
    steps: STEPS,
    context,
    opportunityId: OPP,
    billingUnit: "job_search",
    estimate: { billingUnit: "job_search", estimatedCostUsd: 0.012 },
    ...overrides,
  });
}

/**
 * 正在跑的行按「行自己的 updated_at + 1 分钟」读，
 * 这样断言不依赖测试机的真实墙钟（repository 写库用的是 Date.now()）。
 */
function liveNow(runId: string): Date {
  const row = db.rows("coach_runs").find((item) => String(item.id) === String(runId)) || db.rows("coach_runs")[0];
  return new Date(Date.parse(String(row.updated_at)) + 60 * 1000);
}

describe("startTask：建任务 = 落 coach_runs + planned 事件", () => {
  test("建出来是「待跑」，还没起跑", async () => {
    const { runId, status, reused } = await newTask();
    expect(status).toBe("pending");
    expect(reused).toBe(false);
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);

    const [row] = db.rows("coach_runs");
    expect(row).toMatchObject({ user_id: USER, opportunity_id: OPP, action_type: "job_decision", status: "ready" });
    // createCoachRun 真的被调到了：上下文与指纹落库（FR-33 的债）。
    expect(row.context_snapshot).toBe(context);
    expect(row.context_version).toBe(2);

    const planned = db.rows("coach_run_events").find((event) => event.event_type === "planned" && (event.payload as { steps?: unknown }).steps);
    expect(planned?.payload).toMatchObject({
      billingUnit: "job_search",
      billingBasis: "per_task",
      estimate: { estimatedCostUsd: 0.012 },
    });
    expect((planned?.payload as { steps: typeof STEPS }).steps).toEqual(STEPS);
  });

  test("同一 idempotencyKey 第二次调用不再建一份任务", async () => {
    const first = await newTask({ idempotencyKey: "job-search:client-abc" });
    const second = await newTask({ idempotencyKey: "job-search:client-abc" });
    expect(second.runId).toBe(first.runId);
    expect(second.reused).toBe(true);
    expect(second.status).toBe("pending");
    expect(db.rows("coach_runs")).toHaveLength(1);
  });

  test("idempotency_key 写在 coach_runs 上（createCoachRun 不收这个参数）", async () => {
    await newTask({ idempotencyKey: "job-search:client-abc" });
    expect(db.rows("coach_runs")[0].idempotency_key).toBe("job-search:client-abc");
  });

  test("数据库不可用时不假装建成功", async () => {
    (getDbClient as jest.Mock).mockResolvedValue(null);
    await expect(newTask()).rejects.toThrow("数据库不可用");
  });
});

describe("生命周期迁移", () => {
  test.each(["ready", "waiting_user"])("从 %s 直接完成经过保存状态，不依赖旧对象被隐式更新", async (status) => {
    const { runId } = await newTask();
    if (status === "waiting_user") {
      await startExecution({ userId: USER, runId });
      await waitForUser({ userId: USER, runId, question: "城市？" });
    }
    await expect(completeTask({ userId: USER, runId, result: { saved: true } })).resolves.toEqual({ status: "done" });
    expect(db.rows("coach_runs")[0]).toMatchObject({ status: "completed", output: { saved: true } });
  });

  test("并发创建相同请求只保留一个任务和一个执行者", async () => {
    const results = await Promise.all([newTask({ idempotencyKey: "race" }), newTask({ idempotencyKey: "race" })]);
    expect(db.rows("coach_runs")).toHaveLength(1);
    expect(new Set(results.map((result) => result.runId)).size).toBe(1);
    expect(results.filter((result) => !result.reused)).toHaveLength(1);
  });

  test("已取消任务不能被迟到结果覆盖或追加完成事件", async () => {
    const { runId } = await newTask();
    await cancelTask({ userId: USER, runId });
    const before = JSON.stringify(db.tables);
    await expect(completeTask({ userId: USER, runId, result: { late: true } })).rejects.toThrow("Invalid coach run transition");
    await expect(failTask({ userId: USER, runId, reason: "error" })).rejects.toThrow("Invalid coach run transition");
    expect(JSON.stringify(db.tables)).toBe(before);
  });
  test("跑中 → 保存 → 完成：产物先进 output，状态才允许 completed", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    expect(db.rows("coach_runs")[0]).toMatchObject({ status: "running" });

    await beginStep({ userId: USER, runId, stepId: "collect" });
    await completeStep({ userId: USER, runId, stepId: "collect", resultDigest: "候选 48 条" });
    await beginStep({ userId: USER, runId, stepId: "screen" });
    await completeStep({ userId: USER, runId, stepId: "screen", resultDigest: "命中 12 条" });

    // 读「正在跑」时把时钟贴到行自己的 updated_at 上，避免依赖真实墙钟。
    const ledger = await getTaskLedger({ userId: USER, runId, now: liveNow(runId) });
    expect(ledger.status).toBe("running");
    expect(ledger.steps.map((step) => step.status)).toEqual(["done", "done", "pending"]);

    const done = await completeTask({ userId: USER, runId, result: { jobs: 12 } });
    expect(done.status).toBe("done");
    const row = db.rows("coach_runs")[0];
    expect(row).toMatchObject({ status: "completed", stopped_reason: "completed" });
    expect(row.output).toEqual({ jobs: 12 });

    const final = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(final).toMatchObject({ status: "done", outcome: "complete", billingUnit: "job_search", result: { jobs: 12 }, partialResult: null });
    expect(final.steps.map((step) => step.status)).toEqual(["done", "done", "pending"]);
    // 每一步都留了流水，不是只有一条最终状态。
    const types = db.rows("coach_run_events").map((event) => event.event_type);
    expect(types).toEqual(expect.arrayContaining(["created", "planned", "tool_started", "tool_completed", "validation", "completed"]));
  });

  test("生成完但没落库不算完成：completed 之前必须经过 saving", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await updateRunStatus({ userId: USER, runId, to: "saving" });
    await expect(updateRunStatus({ userId: USER, runId, to: "completed", stoppedReason: "completed" })).resolves.toBeTruthy();
    expect(deriveTaskStatus({ status: "saving", updated_at: new Date(NOW).toISOString() }, [], { now: new Date(NOW) })).toBe("running");
  });

  test("缺信息挂起 → 恢复：waiting_user 在界面仍算跑中，不空转", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await waitForUser({ userId: USER, runId, question: "要投哪个城市？" });
    expect(db.rows("coach_runs")[0]).toMatchObject({ status: "waiting_user", stopped_reason: "awaiting_user" });
    let ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("running");

    await resumeTask({ userId: USER, runId });
    expect(db.rows("coach_runs")[0].status).toBe("running");
    expect((await getTaskLedger({ userId: USER, runId, now: liveNow(runId) })).status).toBe("running");
    await completeTask({ userId: USER, runId, result: { ok: true } });
    ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("done");
  });

  test("已完成后不允许再失败收口（非法迁移直接抛）", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await completeTask({ userId: USER, runId, result: { ok: true } });
    await expect(failTask({ userId: USER, runId, reason: "error" })).rejects.toThrow("Invalid coach run transition");
  });
});

describe("部分完成与失败", () => {
  test("跑完两步后崩掉 ⇒ 部分完成，半成品可查", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await beginStep({ userId: USER, runId, stepId: "collect" });
    await completeStep({ userId: USER, runId, stepId: "collect", resultDigest: "候选 48 条" });
    await beginStep({ userId: USER, runId, stepId: "screen" });
    await completeStep({ userId: USER, runId, stepId: "screen", resultDigest: "命中 12 条" });

    const result = await failTask({
      userId: USER,
      runId,
      reason: "timeout",
      partialResult: { candidates: 12, note: "排序没跑完" },
      stepId: "rank",
      failureType: "timeout",
    });
    expect(result.status).toBe("partial");

    const row = db.rows("coach_runs")[0];
    expect(row).toMatchObject({ status: "failed", stopped_reason: "timeout" });
    expect(row.output).toEqual({ candidates: 12, note: "排序没跑完" });

    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger).toMatchObject({ status: "partial", outcome: "partial", runStatus: "failed", stoppedReason: "timeout" });
    expect(ledger.partialResult).toEqual({ candidates: 12, note: "排序没跑完" });
    expect(ledger.result).toBeNull();
    expect(ledger.steps.map((step) => step.status)).toEqual(["done", "done", "pending"]);
    // 是哪一步没跑完，事件里说清楚，不是只留一个「失败」。
    const failure = db.rows("coach_run_events").filter((event) => event.event_type === "validation").at(-1);
    expect(failure?.payload).toMatchObject({ outcome: "partial", stepId: "rank", completedSteps: 2 });
  });

  test("一步都没完成 ⇒ 就是失败，不冒充部分完成", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    const result = await failTask({ userId: USER, runId, reason: "error", partialResult: null, failureType: "provider_error" });
    expect(result.status).toBe("failed");
    const row = db.rows("coach_runs")[0];
    expect(row.output === null || row.output === undefined).toBe(true);
    expect(row.error).toMatchObject({ reason: "error", failureType: "provider_error" });
    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("failed");
    expect(ledger.partialResult).toBeNull();
  });

  test("成本上限也是一种停止，不是静默结束", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await beginStep({ userId: USER, runId, stepId: "collect" });
    await completeStep({ userId: USER, runId, stepId: "collect", resultDigest: "候选 48 条" });
    const result = await failTask({ userId: USER, runId, reason: "cost_cap", partialResult: { candidates: 48 } });
    expect(result.status).toBe("partial");
    expect(db.rows("coach_runs")[0].stopped_reason).toBe("cost_cap");
  });

  test("待跑状态没有 failed 出路：先补一跳 running 再失败", async () => {
    const { runId } = await newTask();
    const result = await failTask({ userId: USER, runId, reason: "permission_denied" });
    expect(result.status).toBe("failed");
    expect(db.rows("coach_runs")[0].stopped_reason).toBe("permission_denied");
  });
});

describe("取消语义", () => {
  test("跑中取消 ⇒ 已取消，已完成步骤仍然可查", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await beginStep({ userId: USER, runId, stepId: "collect" });
    await completeStep({ userId: USER, runId, stepId: "collect", resultDigest: "候选 48 条" });

    const result = await cancelTask({ userId: USER, runId });
    expect(result.status).toBe("cancelled");
    const row = db.rows("coach_runs")[0];
    expect(row).toMatchObject({ status: "cancelled", stopped_reason: "user_cancelled" });
    expect(row.output).toMatchObject({ cancelled: true, retainedSteps: ["collect"] });

    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("cancelled");
    // 未完成步骤在取消后标成 skipped，界面不会一直转圈。
    expect(ledger.steps.map((step) => step.status)).toEqual(["done", "skipped", "skipped"]);
  });

  test("待跑时取消同样合法", async () => {
    const { runId } = await newTask();
    expect((await cancelTask({ userId: USER, runId })).status).toBe("cancelled");
  });

  test("保存窗口取消：状态机没有 saving→cancelled，退化成 failed + 已取消", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await beginStep({ userId: USER, runId, stepId: "collect" });
    await completeStep({ userId: USER, runId, stepId: "collect", resultDigest: "候选 48 条" });
    await updateRunStatus({ userId: USER, runId, to: "saving" });

    const result = await cancelTask({ userId: USER, runId, reason: "用户关页面" });
    expect(result.status).toBe("partial");
    expect(db.rows("coach_runs")[0]).toMatchObject({ status: "failed", stopped_reason: "error" });

    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("partial");
    expect(ledger.outcome).toBe("partial");
  });

  test("保存窗口取消、且没有任何已完成步骤 ⇒ 记成已取消", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    await updateRunStatus({ userId: USER, runId, to: "saving" });
    expect((await cancelTask({ userId: USER, runId })).status).toBe("cancelled");
    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("cancelled");
  });
});

describe("关页面后的可查性（FR-35 验收）", () => {
  /** 直接造一条停在 running 的行：模拟用户关标签页后服务端没人写终态。 */
  async function abandonMidTask(completedSteps: string[]) {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    for (const stepId of completedSteps) {
      await beginStep({ userId: USER, runId, stepId });
      await completeStep({ userId: USER, runId, stepId, resultDigest: `${stepId} 已完成` });
    }
    // 把 updated_at 推到 2 小时前，模拟陈旧行。
    db.rows("coach_runs")[0].updated_at = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    return runId;
  }

  test("查询侧：陈旧跑中 + 有已完成步骤 ⇒ 立刻读出部分完成", async () => {
    const runId = await abandonMidTask(["collect"]);
    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("partial");
    expect(ledger.steps.find((step) => step.id === "collect")?.resultDigest).toBe("collect 已完成");
  });

  test("查询侧：还没出过字 ⇒ 读出失败，不是一直跑中", async () => {
    const runId = await abandonMidTask([]);
    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("failed");
  });

  test("查询侧：没超时的行仍然算跑中", async () => {
    const runId = await abandonMidTask(["collect"]);
    db.rows("coach_runs")[0].updated_at = new Date(NOW - 60 * 1000).toISOString();
    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("running");
  });

  test("落库侧：reconcileStaleTasks 把半成品写成可查的终态", async () => {
    const runId = await abandonMidTask(["collect", "screen"]);
    const reconciled = await reconcileStaleTasks({ userId: USER, now: new Date(NOW) });
    expect(reconciled.map((ledger) => ledger.runId)).toEqual([runId]);

    const row = db.rows("coach_runs")[0];
    expect(row).toMatchObject({ status: "failed", stopped_reason: "timeout" });
    expect(row.output).toMatchObject({ abandoned: true, retainedSteps: ["collect", "screen"] });

    const ledger = await getTaskLedger({ userId: USER, runId, now: new Date(NOW) });
    expect(ledger.status).toBe("partial");
    expect(ledger.outcome).toBe("partial");
    // 落库后不再出现在未收口列表里。
    expect(await listTaskLedgers({ userId: USER, now: new Date(NOW) })).toEqual([]);
  });

  test("落库侧：没有半成品的陈旧行落成失败，output 保持空", async () => {
    const runId = await abandonMidTask([]);
    await reconcileStaleTasks({ userId: USER, now: new Date(NOW) });
    const row = db.rows("coach_runs")[0];
    expect(row).toMatchObject({ status: "failed", stopped_reason: "timeout" });
    expect(db.rows("coach_run_events").some((event) => (event.payload as { outcome?: string }).outcome === "failed")).toBe(true);
    expect(row.output ?? null).toBe(null);
    expect((await getTaskLedger({ userId: USER, runId, now: new Date(NOW) })).status).toBe("failed");
  });

  test("落库侧：正在跑（未超时）的行不动", async () => {
    const { runId } = await newTask();
    await startExecution({ userId: USER, runId });
    db.rows("coach_runs")[0].updated_at = new Date(NOW - 60 * 1000).toISOString();
    expect(await reconcileStaleTasks({ userId: USER, now: new Date(NOW) })).toEqual([]);
    expect(db.rows("coach_runs")[0].status).toBe("running");
    void runId;
  });
});

describe("deriveTaskStatus / deriveSteps 是纯函数", () => {
  const events = [
    { event_type: "planned", payload: { steps: STEPS } },
    { event_type: "tool_started", payload: { stepId: "collect" } },
    { event_type: "tool_completed", payload: { stepId: "collect", resultDigest: "48" } },
  ];

  test("状态到六态的映射逐条固定", () => {
    const stale = { updated_at: new Date(NOW - 60 * 60 * 1000).toISOString() };
    expect(deriveTaskStatus({ status: "reading" }, events, { now: new Date(NOW) })).toBe("pending");
    expect(deriveTaskStatus({ status: "ready" }, events, { now: new Date(NOW) })).toBe("pending");
    expect(deriveTaskStatus({ status: "running", ...stale }, events, { now: new Date(NOW) })).toBe("partial");
    expect(deriveTaskStatus({ status: "waiting_user", ...stale }, events, { now: new Date(NOW) })).toBe("running");
    expect(deriveTaskStatus({ status: "completed", stopped_reason: "completed" }, [...events, { event_type: "validation", payload: { outcome: "complete" } }], { now: new Date(NOW) })).toBe("done");
    expect(deriveTaskStatus({ status: "failed", stopped_reason: "timeout" }, [...events, { event_type: "validation", payload: { outcome: "partial" } }], { now: new Date(NOW) })).toBe("partial");
    expect(deriveTaskStatus({ status: "failed", stopped_reason: "error" }, [...events, { event_type: "validation", payload: { outcome: "failed" } }], { now: new Date(NOW) })).toBe("failed");
    expect(deriveTaskStatus({ status: "cancelled", stopped_reason: "user_cancelled" }, events, { now: new Date(NOW) })).toBe("cancelled");
  });

  test("waiting_user 不参与陈旧判定：它在等用户，不是在跑", () => {
    const veryStale = { updated_at: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString() };
    expect(deriveTaskStatus({ status: "waiting_user", ...veryStale }, events, { now: new Date(NOW) })).toBe("running");
  });

  test("历史状态值仍能读出来（迁移前的行）", () => {
    expect(deriveTaskStatus({ status: "queued" }, events, { now: new Date(NOW) })).toBe("running");
    expect(deriveTaskStatus({ status: "awaiting_user" }, events, { now: new Date(NOW) })).toBe("running");
    expect(deriveTaskStatus({ status: "verifying" }, events, { now: new Date(NOW) })).toBe("running");
  });

  test("读不到行状态就报错：不给用户猜一个状态", () => {
    expect(() => deriveTaskStatus({}, events, { now: new Date(NOW) })).toThrow("读不到就不猜");
    expect(() => deriveTaskStatus({ status: "   " }, events, { now: new Date(NOW) })).toThrow("读不到就不猜");
  });

  test("步骤投影：没有 planned 事件也能从 tool_* 事件还原", () => {
    const steps = deriveSteps([], [{ event_type: "tool_completed", payload: { stepId: "rank", resultDigest: "前 5" } }]);
    expect(steps).toEqual([{ id: "rank", label: "rank", status: "done", resultDigest: "前 5", completedAt: undefined }]);
  });

  test("重复完成同一步骤不会把状态退回 running", () => {
    const steps = deriveSteps(STEPS, [
      { event_type: "tool_completed", payload: { stepId: "collect" } },
      { event_type: "tool_started", payload: { stepId: "collect" } },
    ]);
    expect(steps[0].status).toBe("done");
  });
});

describe("listActiveRuns：进度托盘的订阅形状（GET /api/coach/runs?scope=active 的数据源）", () => {
  const OTHER = "99999999-9999-4999-8999-999999999999";
  const at = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60 * 1000).toISOString();

  test("只出自己的、未收口的行，且只出界面要的那几列", async () => {
    db.seedRows("coach_runs", [
      { id: "run-running", user_id: USER, goal: "找 20 个对口的 agent 产品岗", status: "running", stopped_reason: null, updated_at: at(1), created_at: at(0) },
      { id: "run-waiting", user_id: USER, goal: "把这段经历改写成可投递的表述", status: "waiting_user", stopped_reason: null, updated_at: at(4), created_at: at(3) },
      { id: "run-done", user_id: USER, goal: "已经收口的任务", status: "completed", stopped_reason: null, updated_at: at(6), created_at: at(5) },
      { id: "run-failed", user_id: USER, goal: "断掉并已被 reconcile 收口", status: "failed", stopped_reason: "timeout", updated_at: at(8), created_at: at(7) },
      { id: "run-other", user_id: OTHER, goal: "别人的任务", status: "running", stopped_reason: null, updated_at: at(2), created_at: at(1) },
    ]);
    const rows = await listActiveRuns({ userId: USER });
    // 倒序：最新的活跃任务排在前面，托盘顶部就是用户刚点的那件事。
    expect(rows.map((row) => row.id)).toEqual(["run-waiting", "run-running"]);
    expect(rows[0]).toEqual({ id: "run-waiting", goal: "把这段经历改写成可投递的表述", status: "waiting_user", stopped_reason: null, updated_at: at(4), created_at: at(3) });
  });

  test("「哪些算活跃」只有一处定义：与 listTaskLedgers 返回同一批行", async () => {
    db.seedRows("coach_runs", ["reading", "ready", "running", "waiting_user", "saving", "completed", "failed", "cancelled"].map((status, index) => ({
      id: `run-${status}`, user_id: USER, goal: `任务 ${index}`, status, stopped_reason: null, updated_at: at(index), created_at: at(index),
    })));
    const trayIds = (await listActiveRuns({ userId: USER })).map((row) => row.id).sort();
    const ledgerIds = (await listTaskLedgers({ userId: USER, now: new Date(NOW) })).map((ledger) => ledger.runId).sort();
    expect(trayIds).toEqual(ledgerIds);
    expect(trayIds).toEqual(["run-reading", "run-ready", "run-running", "run-saving", "run-waiting_user"]);
  });
});
