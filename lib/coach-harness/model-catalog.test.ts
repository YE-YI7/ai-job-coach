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
import {existsSync} from "node:fs";
import {join} from "node:path";

// Ids confirmed present on the live gateway at the time the catalog was authored.
// A catalog entry that is not in this set means we would offer a model the gateway
// does not actually host, so the picker could never enable it.
const REAL_GATEWAY_IDS = new Set([
  "hy4-preview","step-3.7-flash",
  "step-5-preview","glm-5.3-flash","glm-5.3-flashx","qwen3.8-flash","mimo-v2.6-flash",
  "qwen3.8-max-0902","kimi-k3","glm-5.3",
  "deepseek-v4-flash","deepseek-v4.1-flash","deepseek-v3.2","deepseek-v4-pro",
  "deepseek-v4-flash-0731","deepseek-v4-pro-0813","deepseek-chat-v3-0324",
]);

test("estimated speed anchors on Qwen3.8 Max = 0.7", () => {
  expect(SPEED_BASELINE_ID).toBe("qwen3.8-max-0902");
  expect(SPEED_BASELINE_VALUE).toBe(0.7);
  expect(findModel(SPEED_BASELINE_ID)?.speedIndex).toBe(0.7);
});
test("picker offers exactly two DeepSeek models and verified StepFun/HY4",()=>{
 expect(MODEL_CATALOG.filter(m=>m.vendor==="DeepSeek").map(m=>m.id)).toEqual(["deepseek-v4.1-flash","deepseek-v4-pro"]);
 expect(isSelectableModelId("hy4-preview")).toBe(true);
 expect(isSelectableModelId("step-3.7-flash")).toBe(true);
});

test("catalog is bounded and never promises free usage without prices", () => {
  expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(6);
  expect(MODEL_CATALOG.length).toBeLessThanOrEqual(12);
  const ids = MODEL_CATALOG.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(REAL_GATEWAY_IDS.has(id)).toBe(true);
  const tiers = new Set(MODEL_CATALOG.map((m) => m.tier));
  expect(tiers).toEqual(new Set(["cheap", "expensive"]));
});

test("all models have local brand assets, explicit reference prices and valid one-decimal estimates",()=>{
  for(const model of catalogWithAvailability([...SELECTABLE_MODEL_IDS])){
    expect(model.logo).toMatch(/^\/models\//);
    expect(existsSync(join(process.cwd(),"public",model.logo))).toBe(true);
    expect(model.referencePrice.sourceUrl).toBe(`https://tokendance.space/models/${model.id}`);
    expect(model.referencePrice.input.min).toBeGreaterThanOrEqual(0);
    expect(model.referencePrice.cachedInput).not.toBeNull();
    expect(Number(model.speedIndex.toFixed(1))).toBe(model.speedIndex);
  }
});

test.each(["step-5-preview","glm-5.3-flash","glm-5.3-flashx","qwen3.8-flash","mimo-v2.6-flash"])("new model %s can be selected without changing auto choices",id=>{
  expect(isChatMode(id)).toBe(true);
  expect(intersectSelectable([{id,supported_protocols:["openai:chat-completions"]}])).toEqual([id]);
  expect(chooseChatModel(id as ChatMode,"",[id])).toBe(id);
  expect(chooseChatModel(id as ChatMode,"",[])).toBeNull();
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
