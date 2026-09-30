/**
 * W6-④ 多步任务进度的客户端视图模型（FR-35）。
 *
 * 另一个工作包（W5）在建 lib/coach-harness/run-ledger/**——本模块刻意不依赖
 * 他们的内部实现：只约定一个窄的读模型（coach_runs 行 → 六态视图 + 取消），
 * 绑定处预计是 GET /api/coach/runs?scope=active 与 POST /api/coach/runs/{id}
 * {action:"cancel"}（端点尚未开通时托盘整体静默隐藏，关页面不代表丢失）。
 * 状态词表对齐 repository 的 CoachRunStatus：
 * reading/ready → 待跑；running/waiting_user/saving → 跑中；
 * completed → 完成；failed 且带 timeout/cost_cap → 部分完成（有半成品可看）；
 * 其余终态 → 失败/取消。
 */

export type RunStatusView = "pending" | "running" | "partial" | "failed" | "done" | "cancelled";

export interface TaskRun {
  id: string;
  goal: string;
  status: RunStatusView;
  /** waiting_user：跑中但停在用户这一步，界面用同一状态词，不额外造一档。 */
  awaitingUser: boolean;
  cancelable: boolean;
  updatedAt: string;
}

export const RUN_STATUS_WORDS: Record<RunStatusView, string> = {
  pending: "待跑",
  running: "跑中",
  partial: "部分完成",
  failed: "失败",
  done: "完成",
  cancelled: "已取消",
};

const RUNNING = new Set(["running", "waiting_user", "saving"]);
const PARTIAL_STOP_REASONS = new Set(["timeout", "cost_cap"]);

export function runStatusView(status: unknown, stoppedReason?: unknown): RunStatusView {
  const value = typeof status === "string" ? status.trim() : "";
  if (value === "completed") return "done";
  if (value === "cancelled") return "cancelled";
  if (value === "failed") return PARTIAL_STOP_REASONS.has(typeof stoppedReason === "string" ? stoppedReason : "") ? "partial" : "failed";
  if (RUNNING.has(value)) return "running";
  if (value === "reading" || value === "ready") return "pending";
  return "pending";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 只认结构化字段；字段不齐的行直接丢弃，不补假进度。 */
export function taskRunsFromRows(raw: unknown): TaskRun[] {
  const rows = Array.isArray((raw as { runs?: unknown })?.runs) ? (raw as { runs: unknown[] }).runs : [];
  const runs: TaskRun[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = readString(row.id);
    const goal = readString(row.goal);
    if (!id || !goal) continue;
    const status = runStatusView(row.status, row.stopped_reason ?? row.stoppedReason);
    runs.push({
      id,
      goal: goal.slice(0, 200),
      status,
      awaitingUser: readString(row.status) === "waiting_user",
      cancelable: status === "pending" || status === "running",
      updatedAt: readString(row.updated_at ?? row.updatedAt),
    });
  }
  return runs.slice(0, 20);
}

/** 有活着的任务才轮询；空列表退到慢档，托盘隐藏不打扰阅读。 */
export function nextPollDelayMs(runs: TaskRun[]): number {
  return runs.some((run) => run.status === "running" || run.status === "pending") ? 10_000 : 60_000;
}

export function cancelRunRequest(runId: string): { method: "POST"; path: string; body: { action: "cancel" } } {
  return { method: "POST", path: `/api/coach/runs/${runId}`, body: { action: "cancel" } };
}
