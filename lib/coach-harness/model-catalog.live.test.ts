import {SELECTABLE_MODEL_IDS,intersectSelectable,catalogWithAvailability} from "./model-catalog";
import {MODEL_PRICING_API,parseModelPrices} from "./model-pricing";

// Anonymous, read-only catalog acceptance. No model calls, keys or user records.
const live=process.env.RUN_MODEL_CATALOG_LIVE==="1"?test:test.skip;
live("all curated models have real chat IDs and public cache/input/output prices",async()=>{
  const [gateway,portal]=await Promise.all([
    fetch("https://tokendance.space/gateway/v1/models",{signal:AbortSignal.timeout(15000)}),
    fetch(MODEL_PRICING_API,{signal:AbortSignal.timeout(15000)}),
  ]);
  expect(gateway.ok).toBe(true);expect(portal.ok).toBe(true);
  const ids=intersectSelectable((await gateway.json()).data);
  expect([...ids].sort()).toEqual([...SELECTABLE_MODEL_IDS].sort());
  const prices=parseModelPrices(await portal.json(),new Date().toISOString());
  for(const item of catalogWithAvailability(ids,prices)){
    expect(item.available).toBe(true);
    expect(prices[item.id]?.live).toBe(true);
    expect(item.referencePrice.cachedInput).not.toBeNull();
  }
},35000);
