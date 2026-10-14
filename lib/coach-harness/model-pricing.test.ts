import {parseModelPrices,formatPriceRange,MODEL_PRICE_SNAPSHOTS} from "./model-pricing";

const fee=(name:string,rate:string,unit="millionTokens")=>({id:`openai:chat-completions:${name}`,plans:[{rate,unit}]});
const payload=(items:unknown[])=>({models:[{slug:"glm-5.3-flash",pricing:{items,reference:[fee("cached_tokens","900")]}}]});
const normal=[fee("input_tokens","0.72"),fee("completion_tokens","2.52")];

test("uses the public chat cache-hit price, not reference, output or cache creation",()=>{
  const prices=parseModelPrices(payload([...normal,fee("cached_tokens","0.207"),fee("cache_creation_input_tokens","9"),{id:"anthropic:messages:cache_read_input_tokens",plans:[{unit:"millionTokens",rate:"8"}]}]),"2026-10-14");
  expect(prices["glm-5.3-flash"]).toMatchObject({cachedInput:{min:0.207,max:0.207},output:{min:2.52,max:2.52},live:true,asOf:"2026-10-14"});
});
test("missing cache tariff is null, never zero or a made-up discount",()=>{
  expect(parseModelPrices(payload(normal),"today")["glm-5.3-flash"].cachedInput).toBeNull();
});
test("zero is a real zero, token units normalize and tiered tariffs retain their range",()=>{
  const prices=parseModelPrices(payload([...normal,{id:"openai:chat-completions:cached_tokens",mode:"progressive",plans:[{rate:"0",unit:"millionTokens"},{rate:"0.0002",unit:"kTokens"}]}]),"today");
  expect(prices["glm-5.3-flash"].cachedInput).toEqual({min:0,max:0.2});
  expect(formatPriceRange(prices["glm-5.3-flash"].cachedInput!)).toBe("0–0.2");
  expect(formatPriceRange({min:0.016,max:0.016})).toBe("0.016");
});
test.each(["", "NaN", "Infinity", "-1", "1oops"])("invalid rate %s is omitted instead of displayed",rate=>{
  expect(parseModelPrices(payload([fee("input_tokens",rate),fee("completion_tokens","2")]),"today")).toEqual({});
});
test("unknown models, modes, fee units and malformed schema never become a tariff",()=>{
  expect(parseModelPrices({data:[]},"today")).toEqual({});
  expect(parseModelPrices({models:[{slug:"image-only",pricing:{items:normal}}]},"today")).toEqual({});
  expect(parseModelPrices(payload([fee("input_tokens","1","images"),normal[1]]),"today")).toEqual({});
  expect(parseModelPrices(payload([...normal,{id:"openai:chat-completions:cached_tokens",mode:"sku",plans:[{rate:"1",unit:"millionTokens"}]}]),"today")["glm-5.3-flash"].cachedInput).toBeNull();
});

describe("public pricing refresh",()=>{
  const originalFetch=global.fetch;
  afterEach(()=>{global.fetch=originalFetch;});
  test("failure keeps dated snapshots and never calls a model or a credential endpoint",async()=>{
    jest.resetModules();
    const fetchMock=jest.fn().mockRejectedValue(new Error("offline"));global.fetch=fetchMock;
    const mod=await import("./model-pricing");
    expect(await mod.getModelReferencePrices()).toEqual(MODEL_PRICE_SNAPSHOTS);
    expect(fetchMock.mock.calls[0][0]).toBe("https://tokendance.space/portal/api/models/all");
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
    await mod.getModelReferencePrices();expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test("parallel reads share one refresh; partial results keep dated fallback only for missing rows",async()=>{
    jest.resetModules();
    const fetchMock=jest.fn().mockResolvedValue({ok:true,json:async()=>payload([...normal,fee("cached_tokens","0.1")])});global.fetch=fetchMock;
    const mod=await import("./model-pricing");
    const [a,b]=await Promise.all([mod.getModelReferencePrices(),mod.getModelReferencePrices()]);
    expect(a).toBe(b);expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a["glm-5.3-flash"]).toMatchObject({live:true,cachedInput:{min:0.1,max:0.1}});
    expect(a["kimi-k3"]).toMatchObject({live:false,asOf:"2026-10-14"});
  });
});
