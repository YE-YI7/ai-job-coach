import {readableTutorText,ensureMarkdownTables} from "./tutor-format";
test("long old prose gains paragraphs without changing words",()=>{
 const text="这是一个真实的教学示例，需要分清概念与个人经历。".repeat(15);
 const result=readableTutorText(text);
 expect(result).toContain("\n\n");expect(result.replace(/\s/g,"")).toBe(text);
});
test("existing markdown and code are untouched",()=>{
 for(const text of ["## 解释\n\n内容","```text\na → b\n```","1. 第一项\n2. 第二项"])expect(readableTutorText(text)).toBe(text);
});
test("inserts the blank line a GFM table needs so it renders instead of showing pipes",()=>{
 const text="所以更稳的规则是：\n| 调研结果 | 走哪条 |\n|---|---|\n| P0 或 P1 | 正常流程 |";
 expect(ensureMarkdownTables(text)).toBe("所以更稳的规则是：\n\n| 调研结果 | 走哪条 |\n|---|---|\n| P0 或 P1 | 正常流程 |");
 expect(readableTutorText(text)).toContain("：\n\n| 调研结果");
});
test("does not touch tables already separated by a blank line, nor plain text",()=>{
 expect(ensureMarkdownTables("段落\n\n| a |\n|---|\n| b |")).toBe("段落\n\n| a |\n|---|\n| b |");
 expect(ensureMarkdownTables("普通句子，没有表格。")).toBe("普通句子，没有表格。");
});
