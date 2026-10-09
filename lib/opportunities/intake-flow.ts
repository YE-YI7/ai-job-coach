import type { Opportunity } from "./types";

export type IntakePhase = "reading" | "analyzing" | "checking" | "saving";
export const INTAKE_PHASE_LABELS: Record<IntakePhase, string> = {
  reading: "读取材料", analyzing: "整理岗位与经历", checking: "核对识别结果", saving: "保存到工作区",
};
export type IntakeProgress = (phase: IntakePhase, requestId?: string) => void;
export class IntakeSaveError extends Error {
  constructor(message: string) { super(message); this.name = "IntakeSaveError"; }
}

/** A failed save reuses the completed analysis in this mounted workspace. No extra model call. */
export function createIntakeCache<T>() {
  let cached: { key: string; requestId: string; result?: T; pending?: Promise<T> } | null = null;
  return {
    requestId(key: string) {
      if (cached?.key !== key) cached = { key, requestId: crypto.randomUUID() };
      return cached!.requestId;
    },
    async analyze(key: string, load: () => Promise<T>): Promise<T> {
      this.requestId(key);
      if (cached?.result !== undefined) return cached.result;
      if (cached?.pending) return cached.pending;
      const current = cached!;
      current.pending = load().then(result => { current.result = result; return result; }).catch(error => {
        // Quota rejects replays of refunded reservations too; a genuine model retry needs a fresh ID.
        if (cached === current) cached = null;
        throw error;
      }).finally(() => { current.pending = undefined; });
      return current.pending;
    },
    clear() { cached = null; },
  };
}

/** Genuine server phase events, never timer-driven percentages or invented background completion. */
export async function readIntakeResponse(response: Response, onProgress: IntakeProgress) {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) return response.json();
  if (!response.body) throw Error("没有收到整理结果，材料仍在，请重试");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", result: Record<string, unknown> | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress" && Object.hasOwn(INTAKE_PHASE_LABELS, event.phase)) onProgress(event.phase, event.requestId);
    if (event.type === "result") result = event.data;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      lines.forEach(consume);
      if (buffer.length > 2_000_000) throw Error("整理响应过大，请保留材料并联系客服");
    }
    buffer += decoder.decode(); consume(buffer);
  } finally { reader.releaseLock(); }
  if (!result) throw Error("整理连接中断，未收到完整结果；材料仍在，请重试");
  return result;
}

export function intakeReceipt(opportunity: Opportunity, deferred: boolean) {
  const preparation = opportunity.workspaceType === "preparation";
  const unidentified = preparation && !opportunity.resumeText && deferred;
  return {
    title: unidentified ? "原文已保存，材料类型还需确认" : preparation ? "基础档案已建立" : "目标岗位已建立",
    kind: unidentified ? "待确认材料" : preparation ? "简历 / 求职方向" : "岗位 JD",
    savedAt: preparation ? "左侧「我的简历与方向」" : `左侧机会列表 · ${opportunity.company} · ${opportunity.role}`,
    reason: deferred ? "AI 分析未完成，不能据此判断匹配度。原文已经保留，无需重复上传。" : opportunity.recommendationReason,
    next: unidentified ? "查看原文，确认材料类型与目标" : preparation ? "确认求职方向与城市" : !opportunity.resumeText ? "补充简历，判断是否值得投" : "查看岗位判断与证据",
    requirements: preparation || deferred ? [] : opportunity.requirements.slice(0, 3).map(r => r.requirement),
    missing: [(!opportunity.location || /待确认/.test(opportunity.location)) && "地点", /待确认/.test(opportunity.role) && "求职方向", !preparation && !opportunity.resumeText && "简历"].filter(Boolean) as string[],
  };
}
