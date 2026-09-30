import {cancelRunRequest, nextPollDelayMs, RUN_STATUS_WORDS, runStatusView, taskRunsFromRows} from "./task-progress";

describe("runStatusView", () => {
  test("coach_runs 状态词映射到六档视图", () => {
    expect(runStatusView("reading")).toBe("pending");
    expect(runStatusView("ready")).toBe("pending");
    expect(runStatusView("running")).toBe("running");
    expect(runStatusView("saving")).toBe("running");
    expect(runStatusView("completed")).toBe("done");
    expect(runStatusView("cancelled")).toBe("cancelled");
  });
  test("failed + timeout/cost_cap 算部分完成（有半成品可查），其余失败就是失败", () => {
    expect(runStatusView("failed", "timeout")).toBe("partial");
    expect(runStatusView("failed", "cost_cap")).toBe("partial");
    expect(runStatusView("failed", "error")).toBe("failed");
    expect(runStatusView("failed", null)).toBe("failed");
  });
  test("waiting_user 仍是跑中，附「等你一步」标记", () => {
    expect(runStatusView("waiting_user")).toBe("running");
  });
  test("未知状态不谎报进度，按待跑处理", () => {
    expect(runStatusView("something-new")).toBe("pending");
  });
});

describe("taskRunsFromRows", () => {
  const row = (over: Record<string, unknown> = {}) => ({id: "r1", goal: "把这家公司的岗位搜一遍", status: "running", updated_at: "2026-09-30T08:00:00Z", ...over});
  test("只认结构化行；缺 goal 或 id 的直接丢弃", () => {
    const runs = taskRunsFromRows({runs: [row(), row({id: ""}), row({goal: ""}), "junk"]});
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("running");
    expect(runs[0].cancelable).toBe(true);
  });
  test("waiting_user 行带 awaitingUser", () => {
    const runs = taskRunsFromRows({runs: [row({status: "waiting_user"})]});
    expect(runs[0].awaitingUser).toBe(true);
  });
  test("终态不可取消", () => {
    const runs = taskRunsFromRows({runs: [row({status: "completed"}), row({id: "r2", status: "failed", stopped_reason: "error"})]});
    expect(runs.map((r) => r.cancelable)).toEqual([false, false]);
  });
  test("端点没返回 runs 数组时得到空列表 → 托盘隐藏", () => {
    expect(taskRunsFromRows({error: "no route yet"})).toEqual([]);
  });
});

describe("订阅节奏与取消", () => {
  test("有活着的任务快轮询，空列表退慢档，不打扰阅读", () => {
    expect(nextPollDelayMs([])).toBe(60_000);
    expect(nextPollDelayMs([{id: "r", goal: "g", status: "running", awaitingUser: false, cancelable: true, updatedAt: ""}])).toBe(10_000);
    expect(nextPollDelayMs([{id: "r", goal: "g", status: "done", awaitingUser: false, cancelable: false, updatedAt: ""}])).toBe(60_000);
  });
  test("取消动作发往 run-ledger 侧将提供的按 id 端点", () => {
    expect(cancelRunRequest("abc")).toEqual({method: "POST", path: "/api/coach/runs/abc", body: {action: "cancel"}});
  });
  test("状态词全覆盖，界面不会渲染出 undefined", () => {
    expect(Object.keys(RUN_STATUS_WORDS).sort()).toEqual(["cancelled", "done", "failed", "partial", "pending", "running"].sort());
  });
});
