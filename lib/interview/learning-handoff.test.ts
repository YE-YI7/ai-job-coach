import {requestsTeaching,learningHandoff} from "./learning-handoff";
test.each(["我没搞过这个 教我一下","不会啊","我不会啊","请带我学一下","不知道怎么答"])("recognizes teaching: %s",text=>{
  // Bare colloquial '不会啊' is also a direct plea in this answer field.
  expect(requestsTeaching(text)).toBe(true);
});
test.each(["不是不会，我先拆解任务","不用教我，我已经做完了","我设计了一个失败恢复策略","面试官问我怎么教用户","我不会直接发布，会先完成评测","我没有做过线上发布，但完成了原型评测"])("does not hijack an answer: %s",text=>expect(requestsTeaching(text)).toBe(false));
test("carries question and user's denial without inventing transferable experience",()=>{
 const result=learningHandoff("如何设计 multi-agent？","我没做过");
 expect(result.prompt).toContain("如何设计 multi-agent？");
 expect(result.prompt).toContain("我没做过");
 expect(result.prompt).toContain("不要说他其实做过");
});
