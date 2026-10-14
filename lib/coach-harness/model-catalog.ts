// Curated, user-facing model catalog for the coach chat model picker.
//
// Prices come from the separate public TokenDance portal catalog, including
// cache-hit INPUT prices. Speed alone is our coarse relative estimate, with
// Qwen3.8 Max = 0.7 as requested. Neither is used to calculate any actual debit.
import { MODEL_PRICE_SNAPSHOTS, type ModelReferencePrice } from "./model-pricing";
//
// Availability is enforced at runtime by intersecting these ids against the live
// gateway /models list in chat-models.ts, so an id that disappears from the
// gateway is automatically greyed out rather than trusted just because it is
// listed here.

export type PricingTier = "free" | "cheap" | "expensive";

// Concrete ids the user can pick directly (auto/fast presets live in chat-options).
// Every entry has been verified present on the live gateway at the time of writing.
export const SELECTABLE_MODEL_IDS = [
  "hy4-preview",
  "deepseek-v4.1-flash",
  "step-3.7-flash",
  "deepseek-v4-pro",
  "glm-5.3",
  "kimi-k3",
  "qwen3.8-max-0902",
  "step-5-preview",
  "glm-5.3-flash",
  "glm-5.3-flashx",
  "qwen3.8-flash",
  "mimo-v2.6-flash",
] as const;

export type SelectableModelId = (typeof SELECTABLE_MODEL_IDS)[number];

// The economy / managed fallback model. It is NOT a selectable card id because the
// dedicated "fast" preset (see chat-options.chooseChatModel) already routes to it,
// and it works even without a connected TokenPay credential. Listed here only so
// the shared "real gateway id" set and resolveTokenDanceModel can reference it.
export const ECONOMY_MODEL_ID = "deepseek-v4-flash";

// The premium pool auto mode rotates among. Kept in sync with CHAT_MODELS.
export const PREMIUM_MODEL_IDS = ["qwen3.8-max-0902", "kimi-k3", "glm-5.3"] as const;

export const SPEED_BASELINE_ID: SelectableModelId = "qwen3.8-max-0902";
export const SPEED_BASELINE_VALUE = 0.7;

export interface ModelEntry {
  id: SelectableModelId;
  name: string;
  vendor: string;
  // Short brand mark kept as a text fallback (e.g. very small trigger chips).
  monogram: string;
  // Accent colour for the monogram chip fallback — a reference palette we own.
  color: string;
  // Vendor brand assets served from /public/models; provenance in SOURCES.md.
  logo: string;
  tier: PricingTier;
  // Estimated comparison index, not measured tokens/s or a billing multiplier.
  speedIndex: number;
  // Part of the auto premium pool.
  premium: boolean;
  blurb: string;
}

// Vendor-family brand assets, mapped per card.
const MODEL_LOGOS = {
  deepseek: "/models/deepseek.svg",
  zhipu: "/models/zhipu-official.svg",
  kimi: "/models/kimi-official.png",
  qwen: "/models/qwen.svg",
  stepfun: "/models/stepfun-official.jpg",
  hunyuan: "/models/hunyuan-official.png",
  xiaomi: "/models/xiaomi-official.png",
} as const;

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "glm-5.3-flash", name: "GLM 5.3 Flash", vendor: "智谱 Zhipu",
    monogram: "G", color: "#2f6fed", logo: MODEL_LOGOS.zhipu,
    tier: "cheap", speedIndex: 1.0, premium: false,
    blurb: "轻量省钱，适合日常辅导与短段改稿。",
  },
  {
    id: "qwen3.8-flash", name: "Qwen3.8 Flash", vendor: "通义千问 Qwen",
    monogram: "Q", color: "#615ced", logo: MODEL_LOGOS.qwen,
    tier: "cheap", speedIndex: 1.1, premium: false,
    blurb: "轻量省钱，适合日常问答与材料整理。",
  },
  {
    id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash", vendor: "小米 Xiaomi",
    monogram: "M", color: "#a24d1a", logo: MODEL_LOGOS.xiaomi,
    tier: "cheap", speedIndex: 1.0, premium: false,
    blurb: "低成本 Flash，适合高频沟通与内容整理。",
  },
  {
    id: "hy4-preview",
    name: "HY4 Preview",
    vendor: "腾讯混元",
    monogram: "H",
    logo: MODEL_LOGOS.hunyuan,
    color: "#5b7cfa",
    tier: "expensive",
    speedIndex: 0.8,
    premium: false,
    blurb: "混元预览版；可用性以网关为准，费用以 TokenPay 账单为准。",
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#5b7cfa",
    logo: MODEL_LOGOS.deepseek,
    tier: "cheap",
    speedIndex: 0.9,
    premium: false,
    blurb: "较新的 Flash 版本，兼顾速度与理解，长上下文友好。",
  },
  {
    id: "step-3.7-flash",
    name: "Step 3.7 Flash",
    vendor: "阶跃星辰 StepFun",
    monogram: "S",
    logo: MODEL_LOGOS.stepfun,
    color: "#4c66d6",
    tier: "cheap",
    speedIndex: 0.9,
    premium: false,
    blurb: "阶跃 Flash；可用性以网关为准，费用以 TokenPay 账单为准。",
  },
  {
    id: "glm-5.3-flashx", name: "GLM 5.3 FlashX", vendor: "智谱 Zhipu",
    monogram: "G", color: "#2f6fed", logo: MODEL_LOGOS.zhipu,
    tier: "cheap", speedIndex: 1.4, premium: false,
    blurb: "更偏速度的 Flash；价格高于普通 Flash。",
  },
  {
    id: "step-5-preview", name: "Step 5 Preview", vendor: "阶跃星辰 StepFun",
    monogram: "S", color: "#4c66d6", logo: MODEL_LOGOS.stepfun,
    tier: "expensive", speedIndex: 0.8, premium: false,
    blurb: "阶跃新旗舰预览版，适合复杂分析；不会自动替换已选模型。",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    monogram: "D",
    color: "#3f57bd",
    logo: MODEL_LOGOS.deepseek,
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
    logo: MODEL_LOGOS.zhipu,
    tier: "expensive",
    speedIndex: 0.8,
    premium: true,
    blurb: "代码 / 架构 / 评测类问题优选。",
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    vendor: "月之暗面 Moonshot",
    monogram: "K",
    color: "#7c4dff",
    logo: MODEL_LOGOS.kimi,
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
    logo: MODEL_LOGOS.qwen,
    tier: "expensive",
    speedIndex: SPEED_BASELINE_VALUE,
    premium: true,
    blurb: "综合推理与简历改写默认优选，能力全面但较慢。",
  },
];

export const TIER_LABEL: Record<PricingTier | "auto", string> = {
  free: "按实际用量",
  cheap: "实惠",
  expensive: "高阶",
  // auto is not a price tier: it rotates across the premium pool and can call a
  // high-tier (billed) model, so it must never be badged "免费档".
  auto: "自动 · 按问题",
};

export interface CatalogEntryAvailability extends ModelEntry {
  available: boolean;
  referencePrice: ModelReferencePrice;
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
export function catalogWithAvailability(available: string[], prices = MODEL_PRICE_SNAPSHOTS): CatalogEntryAvailability[] {
  const set = new Set(available);
  return MODEL_CATALOG.map((m) => ({ ...m, available: set.has(m.id), referencePrice: prices[m.id] ?? MODEL_PRICE_SNAPSHOTS[m.id] }));
}

// A compact 0–1 fraction for the reference speed bar (clamped defensively).
export function speedFraction(speedIndex: number): number {
  return Math.max(0, Math.min(1, speedIndex / 1.2));
}
