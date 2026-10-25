import {cancelRunRequest, nextPollDelayMs, parseCancelResponse, RUN_STATUS_WORDS, runStatusView, taskRunsFromRows} from "./task-progress";

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

describe("parseCancelResponse", () => {
  test("只有服务端回写 cancelled 才算已取消", () => {
    const outcome = parseCancelResponse(true, {ok: true, runId: "r1", status: "cancelled"});
    expect(outcome.kind).toBe("cancelled");
    expect(outcome.message).toContain("已保存的内容");
    expect(outcome.message).not.toContain("不收费");
  });
  test("保存窗口回写 partial 时不能说成已取消，必须保留已完成步骤", () => {
    const outcome = parseCancelResponse(true, {ok: true, runId: "r1", status: "partial"});
    expect(outcome.kind).toBe("partial");
    expect(outcome.message).toContain("已完成的步骤保留");
  });
  test("HTTP 2xx 但响应体没确认、或状态不认识，都按未确认处理", () => {
    expect(parseCancelResponse(true, {ok: false, error: "任务不存在"}).kind).toBe("unconfirmed");
    expect(parseCancelResponse(true, {ok: true, status: "failed"}).kind).toBe("unconfirmed");
    expect(parseCancelResponse(true, null).kind).toBe("unconfirmed");
    expect(parseCancelResponse(false, {ok: true, status: "cancelled"}).kind).toBe("unconfirmed");
  });
  test("失败文案不回显 runId 或原始错误", () => {
    const outcome = parseCancelResponse(false, {ok: false, error: "runId 无效：9f8e7d6c"});
    expect(outcome.message).not.toContain("9f8e7d6c");
    expect(outcome.message).toContain("没有保存到云端");
  });
});
