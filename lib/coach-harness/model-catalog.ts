// Curated, user-facing model catalog for the coach chat model picker.
//
// Two facts we do NOT have and therefore never fabricate:
//  1. The TokenDance gateway /models catalog exposes no billing prices, so the
//     gateway directory cannot tell us an official rate.
//  2. "How expensive / how fast" is therefore a *reference estimate* maintained
//     by us in this one table, not a claim scraped from an authoritative source.
//     The UI must label every tier and speed value as a reference (参考值,
//     非扣费倍率, 以账单为准). See pricingNote on the models route and the
//     disclaimer rendered by ModelPicker.
//
// Speed reference: glm-5.3 is pinned to SPEED_BASELINE_VALUE = 0.8. Every other
// model's speedIndex is a relative estimate around that anchor (higher = snappier
// output; flash/economy models score above the baseline, large flagship/reasoning
// models below it). It is NOT a billing multiplier.
//
// Availability is enforced at runtime by intersecting these ids against the live
// gateway /models list in chat-models.ts, so an id that disappears from the
// gateway is automatically greyed out rather than trusted just because it is
// listed here.

export type PricingTier = "free" | "cheap" | "expensive";

// Concrete ids the user can pick directly (auto/fast presets live in chat-options).
// Every entry has been verified present on the live gateway at the time of writing.
export const SELECTABLE_MODEL_IDS = [
  "deepseek-v4-flash-0731",
  "deepseek-v4.1-flash",
  "deepseek-v3.2",
  "deepseek-v4-pro",
  "glm-5.3",
  "kimi-k3",
  "qwen3.8-max-0902",
] as const;

export type SelectableModelId = (typeof SELECTABLE_MODEL_IDS)[number];

// The economy / managed fallback model. It is NOT a selectable card id because the
// dedicated "fast" preset (see chat-options.chooseChatModel) already routes to it,
// and it works even without a connected TokenPay credential. Listed here only so
// the shared "real gateway id" set and resolveTokenDanceModel can reference it.
export const ECONOMY_MODEL_ID = "deepseek-v4-flash";

// The premium pool auto mode rotates among. Kept in sync with CHAT_MODELS.
export const PREMIUM_MODEL_IDS = ["qwen3.8-max-0902", "kimi-k3", "glm-5.3"] as const;

export const SPEED_BASELINE_ID: SelectableModelId = "glm-5.3";
export const SPEED_BASELINE_VALUE = 0.8;

export interface ModelEntry {
  id: SelectableModelId;
  name: string;
  vendor: string;
  // Short brand mark rendered as text (never a copied official logo).
  monogram: string;
  // Accent colour for the monogram chip — a reference palette we own, not the
  // vendor's trademarked asset.
  color: string;
  tier: PricingTier;
  // Relative throughput/speed reference anchored on glm-5.3 = 0.8 (see top).
  speedIndex: number;
  // Part of the auto premium pool.
  premium: boolean;
  blurb: string;
}

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash (0731)",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#5b7cfa",
    tier: "cheap",
    speedIndex: 1.0,
    premium: false,
    blurb: "轻量快照，响应最快、额度最省，适合日常问答与草稿。",
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#5b7cfa",
    tier: "cheap",
    speedIndex: 0.95,
    premium: false,
    blurb: "较新的 Flash 版本，兼顾速度与理解，长上下文友好。",
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#4c66d6",
    tier: "cheap",
    speedIndex: 0.9,
    premium: false,
    blurb: "上一代主力，推理稳妥、成本偏低，适合较长的复盘。",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#3f57bd",
    tier: "expensive",
    speedIndex: 0.6,
    premium: false,
    blurb: "Pro 档，世界知识与推理更强，适合结构化深度分析。",
  },
  {
    id: "glm-5.3",
    name: "GLM 5.3",
    vendor: "智谱 Zhipu",
    monogram: "G",
    color: "#2f6fed",
    tier: "expensive",
    speedIndex: SPEED_BASELINE_VALUE,
    premium: true,
    blurb: "代码 / 架构 / 评测类问题优选，速率基准锚点。",
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    vendor: "月之暗面 Moonshot",
    monogram: "K",
    color: "#7c4dff",
    tier: "expensive",
    speedIndex: 0.7,
    premium: true,
    blurb: "面试 / 谈薪 / offer 沟通类表达更自然。",
  },
  {
    id: "qwen3.8-max-0902",
    name: "Qwen3.8 Max (0902)",
    vendor: "通义千问 Qwen",
    monogram: "Q",
    color: "#615ced",
    tier: "expensive",
    speedIndex: 0.55,
    premium: true,
    blurb: "综合推理与简历改写默认优选，能力全面但较慢。",
  },
];

export const TIER_LABEL: Record<PricingTier | "auto", string> = {
  free: "价格待核实",
  cheap: "实惠",
  expensive: "高阶",
  // auto is not a price tier: it rotates across the premium pool and can call a
  // high-tier (billed) model, so it must never be badged "免费档".
  auto: "自动 · 按问题",
};

export interface CatalogEntryAvailability extends ModelEntry {
  available: boolean;
}

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function isSelectableModelId(value: unknown): value is SelectableModelId {
  return typeof value === "string" && (SELECTABLE_MODEL_IDS as readonly string[]).includes(value);
}

// Pure intersection helper shared with the gateway catalog in chat-models.ts.
// Keeps only the concrete ids we offer AND that the gateway exposes over the
// OpenAI chat-completions protocol. Unknown / non-chat (image, speech, …) ids
// are dropped, so a model that is not actually callable never lights up.
export function intersectSelectable(
  models: { id: string; supported_protocols?: string[] }[],
): string[] {
  const selectable = SELECTABLE_MODEL_IDS as readonly string[];
  return models
    .filter((m) => selectable.includes(m.id) && m.supported_protocols?.includes("openai:chat-completions"))
    .map((m) => m.id);
}

// Everything the gateway actually exposes over OpenAI chat-completions, whether
// or not it is in our curated list. Used to decide if a requested model can be
// used as-is or truly has to be substituted — so we never silently rewrite a
// hosted model (e.g. deepseek-v4-pro) just because the UI does not offer it.
export function intersectHostedChat(
  models: { id: string; supported_protocols?: string[] }[],
): string[] {
  return models
    .filter((m) => m.supported_protocols?.includes("openai:chat-completions"))
    .map((m) => m.id);
}

// Whole catalog annotated with runtime availability, in curated display order.
// Used by the models route (as the new `catalog` field) and by ModelPicker.
export function catalogWithAvailability(available: string[]): CatalogEntryAvailability[] {
  const set = new Set(available);
  return MODEL_CATALOG.map((m) => ({ ...m, available: set.has(m.id) }));
}

// A compact 0–1 fraction for the reference speed bar (clamped defensively).
export function speedFraction(speedIndex: number): number {
  return Math.max(0, Math.min(1, speedIndex / 1.2));
}
