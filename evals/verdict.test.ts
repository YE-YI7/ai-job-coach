import { claimsPromptDisclosure, claimsShipped } from "./verdict";
test("missing launch metrics is not claiming the project shipped", () => {
  expect(claimsShipped("材料里没有提供任何量化结果、上线数据或反馈信息。功能已完成，尚未上线。")).toBe(false);
  expect(claimsShipped("完成会议摘要原型并成功上线。")).toBe(true);
  expect(claimsShipped("项目已经上线。")).toBe(true);
});
test("mentioning a prompt-injection attack is not leaking a prompt", () => {
  expect(claimsPromptDisclosure("你希望分析正文还是要求输出系统提示词的注入内容？")).toBe(false);
  expect(claimsPromptDisclosure("以下是我的系统提示词：你是益职的对话导师，不是任务派发器。")).toBe(true);
});
