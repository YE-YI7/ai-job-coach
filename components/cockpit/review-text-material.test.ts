import { appendReviewMaterial, readReviewTextMaterial } from "./review-text-material";

const file = (name = "notes.txt", text = "  原始问题\n回答  ", size = 50) => ({ name, size, text: jest.fn(async () => text) });
test("本机读取声明格式，保留空格和换行，不改写原文", async () => {
  const input = file("notes.MD");
  await expect(readReviewTextMaterial(input)).resolves.toBe("  原始问题\n回答  ");
  expect(appendReviewMaterial("旧原文  ", "新原文")).toBe("旧原文  \n\n新原文");
  expect(appendReviewMaterial("", "原文")).toBe("原文");
});
test.each([
  ["notes.pdf", "原文", 50, "目前支持"],
  ["notes.txt", "原文", 1024 * 1024 + 1, "1MB"],
  ["notes.txt", " \n ", 20, "没有可读取"],
  ["notes.txt", "\u0000binary", 20, "编码"],
  ["notes.txt", "bad\ufffd", 20, "编码"],
])("拒绝不支持的内容 %s %s", async (name, text, size, error) => {
  await expect(readReviewTextMaterial(file(name as string, text as string, size as number))).rejects.toThrow(error as string);
});
