import { coachingStrategy, responseTime } from "./coaching-strategy";
test("明确说不会，先教一个小步，不伪造答对率或情绪", () => {
  const result = coachingStrategy("我没搞过这个，教我一下", [], "job");
  expect(result.product.strategy).toBe("lower_density");
  expect(result.product.writesProfile).toBe(false);
  expect(result.signals.accuracyRate).toBeNull();
  expect(result.text).toContain("直接教");
});
test("没有观测就是未知，客户端非法时长不进统计", () => {
  expect(coachingStrategy("继续", [undefined, -1, Infinity, "12"], "job").product.insufficientSignals).toBe(true);
  expect(responseTime(45_000)).toBe(45_000);
  expect(responseTime(2_000_000)).toBeNull();
});
