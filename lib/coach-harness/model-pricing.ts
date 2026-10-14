// Display-only TokenDance public price references (CNY / million tokens).
// Never use these numbers to debit credits or estimate the user's actual bill.
export const MODEL_PRICING_URL = "https://tokendance.space/models";
export const MODEL_PRICING_API = "https://tokendance.space/portal/api/models/all";
export const MODEL_PRICE_SNAPSHOT_DATE = "2026-10-14";

export interface PriceRange { min: number; max: number }
export interface ModelReferencePrice {
  input: PriceRange;
  output: PriceRange;
  cachedInput: PriceRange | null;
  asOf: string;
  sourceUrl: string;
  live: boolean;
}

function snapshot(id: string, input: number, output: number, cache: number): ModelReferencePrice {
  return {
    input: { min: input, max: input }, output: { min: output, max: output },
    cachedInput: { min: cache, max: cache }, asOf: MODEL_PRICE_SNAPSHOT_DATE,
    sourceUrl: `${MODEL_PRICING_URL}/${id}`, live: false,
  };
}

// Public OpenAI chat-completions prices, not the crossed-out reference tariff,
// cache creation fee, or a different protocol's rates. Failure retains the date.
export const MODEL_PRICE_SNAPSHOTS: Record<string, ModelReferencePrice> = {
  "hy4-preview": snapshot("hy4-preview", 6, 18, 0.3),
  "deepseek-v4.1-flash": snapshot("deepseek-v4.1-flash", 0.8, 3.2, 0.016),
  "step-3.7-flash": snapshot("step-3.7-flash", 1.08, 6.48, 0.216),
  "step-5-preview": snapshot("step-5-preview", 7, 20, 0.35),
  "deepseek-v4-pro": snapshot("deepseek-v4-pro", 8.1, 24.3, 0.27),
  "glm-5.3": snapshot("glm-5.3", 7.2, 25.2, 1.8),
  "glm-5.3-flash": snapshot("glm-5.3-flash", 0.72, 2.52, 0.207),
  "glm-5.3-flashx": snapshot("glm-5.3-flashx", 2, 7, 0.57),
  "kimi-k3": snapshot("kimi-k3", 20, 100, 2),
  "qwen3.8-max-0902": snapshot("qwen3.8-max-0902", 12, 36, 1.5),
  "qwen3.8-flash": snapshot("qwen3.8-flash", 0.8, 2.7, 0.1),
  "mimo-v2.6-flash": snapshot("mimo-v2.6-flash", 1, 2, 0.02),
};

type Row = Record<string, unknown>;
function row(value: unknown): Row | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : undefined;
}

function readRate(items: unknown[], fee: string): PriceRange | null {
  const item = items.map(row).find(item => item?.id === `openai:chat-completions:${fee}`);
  // Conditional progressive tiers remain a range; unknown pricing modes are
  // omitted rather than interpreted as a flat, universally available price.
  if (!item || (item.mode && !["selective", "progressive"].includes(String(item.mode))) || !Array.isArray(item.plans)) return null;
  const rates = item.plans.map(row).flatMap(plan => {
    if (!plan || !["string", "number"].includes(typeof plan.rate) || !/^\d+(?:\.\d+)?$/.test(String(plan.rate))) return [];
    const multiplier = ({ millionTokens: 1, kTokens: 1000, tokens: 1000000 } as Record<string, number>)[String(plan.unit)];
    const value = Number(plan.rate) * multiplier;
    return Number.isFinite(value) && value >= 0 ? [value] : [];
  });
  return rates.length ? { min: Math.min(...rates), max: Math.max(...rates) } : null;
}

export function parseModelPrices(payload: unknown, asOf: string): Record<string, ModelReferencePrice> {
  const models = row(payload)?.models;
  if (!Array.isArray(models)) return {};
  const result: Record<string, ModelReferencePrice> = {};
  for (const value of models) {
    const model = row(value);
    if (!model || typeof model.slug !== "string" || !Object.hasOwn(MODEL_PRICE_SNAPSHOTS, model.slug)) continue;
    const items = row(model.pricing)?.items;
    if (!Array.isArray(items)) continue;
    const input = readRate(items, "input_tokens");
    const output = readRate(items, "completion_tokens");
    if (!input || !output) continue;
    result[model.slug] = {
      input, output, cachedInput: readRate(items, "cached_tokens"), asOf,
      sourceUrl: `${MODEL_PRICING_URL}/${model.slug}`, live: true,
    };
  }
  return result;
}

export function formatPriceRange(price: PriceRange): string {
  const number = (value: number) => Number(value.toPrecision(6)).toString();
  return price.min === price.max ? number(price.min) : `${number(price.min)}–${number(price.max)}`;
}

let priceCache: { until: number; prices: Record<string, ModelReferencePrice> } | undefined;
let pending: Promise<Record<string, ModelReferencePrice>> | undefined;

export async function getModelReferencePrices(): Promise<Record<string, ModelReferencePrice>> {
  if (priceCache && priceCache.until > Date.now()) return priceCache.prices;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(MODEL_PRICING_API, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      if (!response.ok) throw new Error("Public price catalog unavailable");
      const prices = parseModelPrices(await response.json(), new Date().toISOString());
      if (!Object.keys(prices).length) throw new Error("Public price schema changed");
      const merged = { ...MODEL_PRICE_SNAPSHOTS, ...prices };
      priceCache = { until: Date.now() + 15 * 60 * 1000, prices: merged };
      return merged;
    } catch {
      const retained = priceCache?.prices ?? MODEL_PRICE_SNAPSHOTS;
      priceCache = { until: Date.now() + 60 * 1000, prices: retained };
      return retained;
    }
  })();
  try { return await pending; } finally { pending = undefined; }
}
