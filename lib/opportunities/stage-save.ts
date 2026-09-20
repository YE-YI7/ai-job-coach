import type { Opportunity, OpportunityStage } from "./types";

export type StagePatchResult = { ok: boolean; error?: string };

/** 合并到请求结束时的最新状态：不回滚正文，不恢复已删除的岗位。 */
export function mergeStageResult(current: Opportunity[], result: { saved: boolean; opportunities: Opportunity[] }, id: string): Opportunity[] {
  if (!result.saved) return current;
  const saved = result.opportunities.find((item) => item.id === id);
  if (!saved) return current;
  return current.map((item) => item.id === id ? { ...item, stage: saved.stage, stageLabel: saved.stageLabel } : item);
}

/**
 * 阶段推进的落库语义：确认 ≠ 保存成功。云端岗位必须先拿到 PATCH 的
 * 明确成功才提交新状态；失败时列表原样回滚，由调用方把原因播报出来。
 * 纯函数 + 注入 patch，让失败可见性可以被 jest 直接覆盖。
 */
export async function commitStage(options: {
  opportunities: Opportunity[];
  activeId: string;
  stage: OpportunityStage;
  stageLabel: string;
  /** live 且岗位已在云端（非浏览器本地数据）才走 PATCH；本地/demo 直接生效。 */
  isCloud: boolean;
  patch: (opportunity: Opportunity) => Promise<StagePatchResult>;
}): Promise<{ opportunities: Opportunity[]; saved: boolean; error?: string }> {
  const { opportunities, activeId, stage, stageLabel, isCloud, patch } = options;
  const previous = opportunities.find((item) => item.id === activeId);
  if (!previous) return { opportunities, saved: false, error: "未找到该岗位" };
  const updated: Opportunity = { ...previous, stage, stageLabel };
  const optimistic = opportunities.map((item) => (item.id === activeId ? updated : item));
  if (!isCloud) return { opportunities: optimistic, saved: true };
  let result: StagePatchResult;
  try {
    result = await patch(updated);
  } catch {
    result = { ok: false, error: "网络异常" };
  }
  if (!result.ok) {
    return { opportunities, saved: false, error: result.error || "岗位状态同步失败" };
  }
  return { opportunities: optimistic, saved: true };
}
