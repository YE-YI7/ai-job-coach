"use client";

import { useEffect, useState } from "react";
import type { TodayCompanionSummary } from "@/lib/coach-harness/today-view";

type Result = {
  requestScope: string;
  status: "loading" | "present" | "absent" | "error";
  scope: string | null;
  companion: TodayCompanionSummary | null;
  error: string;
};

/** Read-only. Request lifetime never depends on the loading state it writes. */
export function useTodayCompanion({
  scope, enabled, revision = 0, fallback = false, initialCompanion = null,
}: {
  scope: string; enabled: boolean; revision?: number; fallback?: boolean;
  initialCompanion?: TodayCompanionSummary | null;
}) {
  const [result, setResult] = useState<Result>(() => ({
    requestScope: scope, status: initialCompanion ? "present" : "loading",
    scope: initialCompanion ? scope : null, companion: initialCompanion, error: "",
  }));
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    const read = async (target: string) => {
      const response = await fetch(`/api/coach/companion?opportunityId=${encodeURIComponent(target)}`, {
        cache: "no-store", signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(response.status === 401
        ? "登录状态可能已过期，请刷新或重新登录。" : "服务暂时没响应，安排没有丢。");
      return { scope: target, task: body.plan?.companion };
    };
    void (async () => {
      try {
        let found = await read(scope);
        if (!found.task && fallback && scope !== "none" && current) found = await read("none");
        if (!current) return;
        const task = found.task;
        setResult({
          requestScope: scope, status: task ? "present" : "absent",
          scope: task ? found.scope : null, error: "",
          companion: task ? {
            goalTitle: task.goalTitle, stepTitle: task.step?.title || null,
            effort: task.step?.effort || null, weeklyHours: task.weeklyHours || null,
            deadline: task.deadline || null, action: task.action,
          } : null,
        });
      } catch (error) {
        if (!current) return;
        setResult(previous => ({
          requestScope: scope, status: "error",
          scope: previous.requestScope === scope ? previous.scope : null,
          companion: previous.requestScope === scope ? previous.companion : null,
          error: error instanceof Error ? error.message : "网络暂时不可用，安排没有丢。",
        }));
      }
    })();
    return () => { current = false; controller.abort(); };
  }, [enabled, scope, revision, fallback]);
  // Do not display A's data while B's deferred read is still pending (or failed).
  return result.requestScope === scope ? result : {
    requestScope: scope, status: "loading" as const, scope: null, companion: null, error: "",
  };
}
