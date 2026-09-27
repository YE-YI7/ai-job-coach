import {readableTutorText} from "./tutor-format";
test("long old prose gains paragraphs without changing words",()=>{
 const text="这是一个真实的教学示例，需要分清概念与个人经历。".repeat(15);
 const result=readableTutorText(text);
 expect(result).toContain("\n\n");expect(result.replace(/\s/g,"")).toBe(text);
});
test("existing markdown and code are untouched",()=>{
 for(const text of ["## 解释\n\n内容","```text\na → b\n```","1. 第一项\n2. 第二项"])expect(readableTutorText(text)).toBe(text);
});
