/**
 * W6-② 模型降级/升档可见性的纯前端视图模型。
 *
 * 产品红线：经济档不可用而系统换到更贵的档时，必须显式告知并等用户确认，
 * 静默升档判负（线上翻过车）。首选读 done 事件里的 `learning_trace.modelSwap`
 * （route 真换了档就会带，auto 档下只有它知道——没有「用户选的档」可对比）；
 * 老台账没有这个字段时退回用已有字段（learning_trace.model / modelCalls /
 * modelUsage.model）做尽力检测，检测不到不等于没发生。
 */

import { ECONOMY_MODEL_ID, findModel, type PricingTier } from "@/lib/coach-harness/model-catalog";
import type { ChatMode } from "@/lib/coach-harness/chat-options";

export interface ModelTurnTrace {
  model?: string;
  modelCalls?: number;
  modelUsage?: { model?: string } | null;
  /** route 层的换档事实：from 是本轮首选，to 是实际应答的那一个。 */
  modelSwap?: { from: string; to: string } | null;
}

export type ModelTurnNotice = {
  /** tier-up = 实际回答的档比你选的档贵，必须确认后才继续；change = 同档或更省的换法，只说明。 */
  kind: "tier-up" | "change";
  text: string;
  /** 确认状态按 from→to 记在 localStorage，同一次换法不反复拦人。 */
  ackKey: string;
  requiresConfirm: boolean;
};

const TIER_RANK: Record<PricingTier | "unknown", number> = { free: 0, cheap: 1, expensive: 2, unknown: 1 };

// 已实测的网关回显版本名，仅用于展示身份；不改请求模型或计费路由。
function displayModelId(id: string): string {
  return id === "deepseek-v4-1-flash-260910" ? "deepseek-v4.1-flash" : id;
}

function sameDisplayModel(a: string, b: string): boolean {
  return displayModelId(a) === displayModelId(b);
}

export function modelTier(id: string | undefined | null): PricingTier | "unknown" {
  if (!id) return "unknown";
  if (id === ECONOMY_MODEL_ID) return "cheap";
  return findModel(displayModelId(id))?.tier ?? "unknown";
}

const TIER_LABEL_CN: Record<PricingTier | "unknown", string> = {
  free: "免费档",
  cheap: "实惠档",
  expensive: "高阶档",
  unknown: "另一档",
};

function label(id: string | undefined | null): string {
  if (!id) return "未知模型";
  return findModel(displayModelId(id))?.name ?? id;
}

/** 用户在挑选器里点的档对应的模型；auto 不承诺具体模型，返回 null。 */
export function expectedModelForMode(mode: ChatMode): string | null {
  if (mode === "auto") return null;
  if (mode === "fast") return ECONOMY_MODEL_ID;
  return mode;
}

export function modelTurnNotice(input: { modelMode: ChatMode; trace: ModelTurnTrace | null | undefined }): ModelTurnNotice | null {
  const trace = input.trace;
  if (!trace) return null;
  const requested = trace.model;
  const answered = trace.modelUsage?.model || trace.model;
  if (!answered && !requested) return null;

  // route 明确说过换了档：这是事实，不是推断，优先于下面两条启发式。
  const swap = trace.modelSwap;
  if (swap && swap.from && swap.to && !sameDisplayModel(swap.from, swap.to)) {
    const up = TIER_RANK[modelTier(swap.to)] > TIER_RANK[modelTier(swap.from)];
    return build(up ? "tier-up" : "change", swap.from, swap.to, up
      ? `${label(swap.from)} 这一轮不可用，已换到 ${label(swap.to)}（${TIER_LABEL_CN[modelTier(swap.to)]}）完成回答，计费更高。确认再继续，或换回原来的档。`
      : `${label(swap.from)} 这一轮不可用，已换到 ${label(swap.to)}（${TIER_LABEL_CN[modelTier(swap.to)]}）完成回答，更省。`);
  }

  // route 台账里的首选模型与实际应答模型不一致（冷却重试或网关回显不同 id）：
  // 小注不臆断原因，只说谁完成了回答；若实际那档更贵，同样按升档处理等确认。
  if (requested && answered && !sameDisplayModel(requested, answered)) {
    const up = TIER_RANK[modelTier(answered)] > TIER_RANK[modelTier(requested)];
    return build(up ? "tier-up" : "change", requested, answered, up
      ? `这一轮台账首选是 ${label(requested)}，实际由 ${label(answered)}（${TIER_LABEL_CN[modelTier(answered)]}）完成回答，计费更高。确认再继续，或换回实惠档。`
      : `这一轮台账首选是 ${label(requested)}，实际由 ${label(answered)}（${TIER_LABEL_CN[modelTier(answered)]}）完成了回答。`);
  }
  const expected = expectedModelForMode(input.modelMode);
  if (expected && answered && !sameDisplayModel(expected, answered)) {
    const up = TIER_RANK[modelTier(answered)] > TIER_RANK[modelTier(expected)];
    const text = up
      ? `你选的是 ${label(expected)}（${TIER_LABEL_CN[modelTier(expected)]}），这一轮实际由 ${label(answered)}（${TIER_LABEL_CN[modelTier(answered)]}）回答，计费更高。确认再继续，或换回原来的档。`
      : `这一轮没有用你选的 ${label(expected)}，改由 ${label(answered)}（${TIER_LABEL_CN[modelTier(answered)]}）完成回答，更省。`;
    return build(up ? "tier-up" : "change", expected, answered, text);
  }
  return null;
}

function build(kind: ModelTurnNotice["kind"], from: string, to: string, text: string): ModelTurnNotice {
  return { kind, text, ackKey: `${from}→${to}`, requiresConfirm: kind === "tier-up" };
}

/** 多步任务台账视图模型见 task-progress.ts；这里只是对话内单轮提示。 */
export function isAcknowledged(store: { getItem(k: string): string | null }, notice: ModelTurnNotice): boolean {
  try {
    const raw = store.getItem("yi-zhi.model-ack");
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(notice.ackKey);
  } catch {
    return false;
  }
}

export function rememberAcknowledged(store: { getItem(k: string): string | null; setItem(k: string, v: string): void }, notice: ModelTurnNotice): void {
  try {
    const raw = store.getItem("yi-zhi.model-ack");
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(notice.ackKey)) list.push(notice.ackKey);
    store.setItem("yi-zhi.model-ack", JSON.stringify(list.slice(-20)));
  } catch {
    // 存储不可用只影响记住确认，不影响本次会话内的确认。
  }
}
