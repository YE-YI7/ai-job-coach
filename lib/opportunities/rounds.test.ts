import { formatRoundLabel, normalizeRoundLabel, parseRoundOrdinal } from "./timeline";

/**
 * 轮次归一化：模拟面试与面试复盘共用同一套「第几面」语义。
 * 重点是别再出现「面试侧只有题型、复盘侧才有轮次」的分裂，且轮次必须支持 >3。
 */
test("第几面：数字、中文、「第X轮」都归一为同一标签", () => {
  expect(normalizeRoundLabel("3")).toBe("三面");
  expect(normalizeRoundLabel("3面")).toBe("三面");
  expect(normalizeRoundLabel("第3面")).toBe("三面");
  expect(normalizeRoundLabel("第 4 轮")).toBe("四面");
  expect(normalizeRoundLabel("五面")).toBe("五面");
  expect(normalizeRoundLabel("十面")).toBe("十面");
  expect(normalizeRoundLabel("十一")).toBe("第11面");
});

test("轮次可以超过三面（面试与复盘同一套语义）", () => {
  expect(parseRoundOrdinal("6")).toBe(6);
  expect(parseRoundOrdinal(12)).toBe(12);
  expect(formatRoundLabel(4)).toBe("四面");
  expect(formatRoundLabel(12)).toBe("第12面");
  expect(normalizeRoundLabel("第12面")).toBe("第12面");
});

test("惯用轮次叫法保留原样，不硬套成数字", () => {
  expect(normalizeRoundLabel("电话初筛")).toBe("电话初筛");
  expect(normalizeRoundLabel("初筛")).toBe("电话初筛");
  expect(normalizeRoundLabel("终面")).toBe("终面");
  expect(normalizeRoundLabel("hr 面")).toBe("HR面");
});

test("识别不了就返回 null：由 UI 如实提示，不悄悄兜底", () => {
  expect(normalizeRoundLabel("随便写的")).toBeNull();
  expect(normalizeRoundLabel("")).toBeNull();
  expect(normalizeRoundLabel("   ")).toBeNull();
  expect(parseRoundOrdinal(0)).toBeNull();
  expect(parseRoundOrdinal("99")).toBe(99);
  expect(parseRoundOrdinal("100")).toBeNull();
});
