import { ACQUISITION_SESSION_MS, FIRST_SOURCE_KEY, SESSION_SOURCE_KEY, classifyAcquisition, createAcquisitionCollector, sanitizeAcquisitionProperties } from "./acquisition";

const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
};
const entry = { search: "", referrer: "", host: "yizhioffer.com", now: 10000 };
test.each([
  ["https://www.google.com/search?q=private", "google"],
  ["https://gemini.google.com/app/private", "gemini"],
  ["https://chatgpt.com/c/private", "chatgpt"],
  ["https://kimi.moonshot.cn/", "kimi"],
  ["https://m.baidu.com/s?wd=private", "baidu"],
  ["https://google.com.attacker.example", "external"],
  ["https://evilgoogle.com", "external"],
  ["https://www.yizhioffer.com/cockpit", null],
  ["https://ai-job-coach.xin/login", null],
  ["javascript:alert(1)", null],
  ["not-a-url", null],
])("classifies host boundaries without retaining private URL %s", (referrer, expected) => {
  expect(classifyAcquisition("", referrer, entry.host)).toBe(expected);
});
test("explicit labels win but arbitrary query content never becomes a source", () => {
  expect(classifyAcquisition("?utm_source=xhs", "https://google.com", entry.host)).toBe("xiaohongshu");
  expect(classifyAcquisition("?ref=person@example.com", "", entry.host)).toBe("campaign_other");
  expect(classifyAcquisition("?utm_source=constructor", "", entry.host)).toBe("campaign_other");
  expect(classifyAcquisition("?utm_source=growth-qa-20261021", "", entry.host)).toBe("growth-qa");
});
test("first source is independent of later sessions and refresh preserves current source", () => {
  const local = storage(), tab = storage();
  const collect = createAcquisitionCollector();
  expect(collect({ ...entry, local, tab }).first_source).toBe("direct");
  const searchVisit = createAcquisitionCollector();
  const next = searchVisit({ ...entry, referrer: "https://www.bing.com/search?q=private", local, tab, now: 20000 });
  expect(next).toMatchObject({ first_source: "direct", session_source: "bing", attribution_version: 2 });
  expect(createAcquisitionCollector()({ ...entry, local, tab, now: 30000 }).session_source).toBe("bing");
  expect(searchVisit({ ...entry, local, tab, now: 20000 + ACQUISITION_SESSION_MS }).session_source).toBe("direct");
  expect(local.getItem(FIRST_SOURCE_KEY)).toBe("direct");
  expect(JSON.stringify([...local.data, ...tab.data])).not.toContain("private");
});
test("a landing query/referrer is not replayed as an external entry on every SPA event", () => {
  const collect = createAcquisitionCollector();
  const input = { ...entry, search: "?utm_source=watcha" };
  expect(collect(input).session_source).toBe("watcha");
  expect(collect({ ...input, now: entry.now + ACQUISITION_SESSION_MS }).session_source).toBe("direct");
});
test("storage restrictions and corrupted state do not break attribution", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const collect = createAcquisitionCollector();
  expect(collect({ ...entry, local: denied, tab: denied, referrer: "https://doubao.com/" }).session_source).toBe("doubao");
  const tab = storage(); tab.setItem(SESSION_SOURCE_KEY, '{"source":"bad","last":-1}');
  expect(createAcquisitionCollector()({ ...entry, tab }).session_source).toBe("direct");
});
test("legacy QA is preserved without migrating or overwriting legacy attribution", () => {
  const local = storage(); local.setItem("yi-zhi-first-touch-source-v1", "growth-qa-old");
  expect(createAcquisitionCollector()({ ...entry, local }).session_source).toBe("growth-qa");
  expect(local.getItem("yi-zhi-first-touch-source-v1")).toBe("growth-qa-old");
});
test("server drops incomplete v2 claims and rejects arbitrary attribution strings", () => {
  expect(sanitizeAcquisitionProperties({ source: "person@example.com", first_source: "bad", session_source: "google", attribution_version: 2, count: 1 })).toEqual({ source: "campaign_other", count: 1 });
  expect(sanitizeAcquisitionProperties({ source: "google", first_source: "google", session_source: "chatgpt", attribution_version: 2 })).toEqual({ source: "google", first_source: "google", session_source: "chatgpt", attribution_version: 2 });
});
