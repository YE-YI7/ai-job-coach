import {
  MODEL_CATALOG,
  SELECTABLE_MODEL_IDS,
  PREMIUM_MODEL_IDS,
  SPEED_BASELINE_ID,
  SPEED_BASELINE_VALUE,
  intersectSelectable,
  catalogWithAvailability,
  findModel,
  isSelectableModelId,
  speedFraction,
} from "./model-catalog";
import {CHAT_MODELS,chooseChatModel,isChatMode,type ChatMode} from "./chat-options";

// Ids confirmed present on the live gateway at the time the catalog was authored.
// A catalog entry that is not in this set means we would offer a model the gateway
// does not actually host, so the picker could never enable it.
const REAL_GATEWAY_IDS = new Set([
  "qwen3.8-max-0902","kimi-k3","glm-5.3",
  "deepseek-v4-flash","deepseek-v4.1-flash","deepseek-v3.2","deepseek-v4-pro",
  "deepseek-v4-flash-0731","deepseek-v4-pro-0813","deepseek-chat-v3-0324",
]);

test("speed baseline anchors on glm-5.3 = 0.8", () => {
  expect(SPEED_BASELINE_ID).toBe("glm-5.3");
  expect(SPEED_BASELINE_VALUE).toBe(0.8);
  expect(findModel("glm-5.3")?.speedIndex).toBe(0.8);
});

test("catalog is bounded and never promises free usage without prices", () => {
  expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(6);
  expect(MODEL_CATALOG.length).toBeLessThanOrEqual(9);
  const ids = MODEL_CATALOG.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(REAL_GATEWAY_IDS.has(id)).toBe(true);
  const tiers = new Set(MODEL_CATALOG.map((m) => m.tier));
  expect(tiers).toEqual(new Set(["cheap", "expensive"]));
});

test("premium pool matches CHAT_MODELS and stays in sync with the auto fallback", () => {
  expect([...PREMIUM_MODEL_IDS]).toEqual([...CHAT_MODELS]);
  expect(MODEL_CATALOG.filter((m) => m.premium).map((m) => m.id).sort())
    .toEqual([...PREMIUM_MODEL_IDS].sort());
});

test("economy fallback model is intentionally NOT a selectable card id", () => {
  expect((SELECTABLE_MODEL_IDS as readonly string[]).includes("deepseek-v4-flash")).toBe(false);
  // yet fast mode still routes to it, independent of the gateway list.
  expect(chooseChatModel("fast", "复杂架构", [])).toBe("deepseek-v4-flash");
});

test("intersectSelectable keeps only curated chat-capable gateway ids", () => {
  const gateway = [
    { id: "glm-5.3", supported_protocols: ["openai:chat-completions"] },
    { id: "deepseek-v4.1-flash", supported_protocols: ["openai:chat-completions", "anthropic:messages"] },
    { id: "deepseek-v4-flash", supported_protocols: ["openai:chat-completions"] }, // offered via fast preset, not here
    { id: "seedream-5.0-lite", supported_protocols: ["openai:images"] }, // not a chat model
    { id: "mystery-model", supported_protocols: ["openai:chat-completions"] }, // not curated
  ];
  expect(intersectSelectable(gateway)).toEqual(["glm-5.3", "deepseek-v4.1-flash"]);
});

test("catalogWithAvailability flags only the models the gateway currently offers", () => {
  const enriched = catalogWithAvailability(["glm-5.3", "kimi-k3"]);
  expect(enriched.map((m) => m.id)).toEqual(MODEL_CATALOG.map((m) => m.id)); // curated order preserved
  expect(enriched.find((m) => m.id === "glm-5.3")?.available).toBe(true);
  expect(enriched.find((m) => m.id === "kimi-k3")?.available).toBe(true);
  expect(enriched.find((m) => m.id === "qwen3.8-max-0902")?.available).toBe(false);
});

test("speedFraction clamps the reference bar to 0..1", () => {
  expect(speedFraction(0.8)).toBeCloseTo(0.8 / 1.2, 5);
  expect(speedFraction(0)).toBe(0);
  expect(speedFraction(5)).toBe(1);
});

test("every selectable id, plus auto/fast, is a valid ChatMode", () => {
  for (const id of SELECTABLE_MODEL_IDS) {
    expect(isChatMode(id)).toBe(true);
    expect(isSelectableModelId(id)).toBe(true);
  }
  expect(isChatMode("auto")).toBe(true);
  expect(isChatMode("fast")).toBe(true);
  expect(isChatMode("totally-fake-9000")).toBe(false);
  expect(isChatMode(undefined)).toBe(false);
});

test("auto semantics survive the expanded pool and a specific card needs availability", () => {
  const available = [...SELECTABLE_MODEL_IDS];
  expect(chooseChatModel("auto", "面试练习", available)).toBe("kimi-k3");
  expect(chooseChatModel("auto", "RAG 召回评测", available)).toBe("glm-5.3");
  expect(chooseChatModel("auto", "改简历", available)).toBe("qwen3.8-max-0902");
  expect(chooseChatModel("deepseek-v4.1-flash" as ChatMode, "", available)).toBe("deepseek-v4.1-flash");
  expect(chooseChatModel("deepseek-v4.1-flash" as ChatMode, "", ["glm-5.3"])).toBeNull();
});
