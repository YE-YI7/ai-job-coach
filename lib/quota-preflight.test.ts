import { assertGenerationQuota } from "./quota-preflight";
test.each(["chat", "interview", "resume"] as const)("allows confirmed %s credit without charging", async type => {
  const fetcher = jest.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,checks:{[type]:{allowed:true}}})});
  await expect(assertGenerationQuota(type,fetcher)).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith("/api/quota/check",expect.objectContaining({cache:"no-store"}));
});
test("no credit preserves the saved answer and offers continuation",async()=>{
  const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,checks:{chat:{allowed:false}}})});
  await expect(assertGenerationQuota("chat",fetcher)).rejects.toThrow("不必重填");
});
test("unknown quota cannot silently begin a paid call",async()=>{
  const fetcher=jest.fn().mockResolvedValue({ok:false,json:async()=>({ok:false})});
  await expect(assertGenerationQuota("chat",fetcher)).rejects.toThrow("暂时无法确认额度");
});
