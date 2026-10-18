import { isPhonePurpose, maskPhone, normalizeMainlandPhone } from "./identity";

test.each(["13800138000", "+86 138 0013 8000", "138-0013-8000"])("normalizes %s without changing identity", value => {
  expect(normalizeMainlandPhone(value)).toBe("+8613800138000");
});
test.each(["+1 13800138000", "8613800138000", "008613800138000", "12800138000", "1380013800", "138001380000", "13800138000x", null, 13800138000])("rejects ambiguous or invalid input %s", value => {
  expect(normalizeMainlandPhone(value)).toBeNull();
});
test("masks the account phone and separates binding purpose", () => {
  expect(maskPhone("+8613800138000")).toBe("+86 138****8000");
  expect(isPhonePurpose("bind")).toBe(true);
  expect(isPhonePurpose("reset")).toBe(false);
});
