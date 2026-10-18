import { phoneRetrySeconds, phoneWaitLabel, readPhoneWait } from "./wait";
test("wait labels distinguish a daily block from a short resend countdown", () => {
  expect(phoneWaitLabel(43)).toBe("43 秒后重试");
  expect(phoneWaitLabel(61)).toBe("2 分钟后重试");
  expect(phoneWaitLabel(48000)).toBe("14 小时后重试");
});
test("retry headers are bounded and malformed storage cannot block a page forever", () => {
  expect(phoneRetrySeconds(null)).toBe(60);
  expect(phoneRetrySeconds("NaN")).toBe(60);
  expect(phoneRetrySeconds("999999999")).toBe(86400);
  expect(readPhoneWait({ action:"send",reason:"daily",until:2000 },1000)).not.toBeNull();
  for(const until of [0,1000,Infinity,NaN,1000+86400_001]) expect(readPhoneWait({action:"send",reason:"daily",until},1000)).toBeNull();
  expect(readPhoneWait({action:"other",reason:"daily",until:2000},1000)).toBeNull();
});
