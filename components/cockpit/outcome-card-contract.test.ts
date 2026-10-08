import fs from "node:fs";
import path from "node:path";
// 静态UI契约，不替代真实浏览器验收（#62 仍待批准）。
const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),"components/cockpit",file),"utf8");
const card=read("OutcomeCard.tsx");
// 结构断言不看排版空格，免得改一处缩进就假报。
const flat=(source:string)=>source.replace(/\s+/g,"");
const cardFlat=flat(card);
const conversation=read("AgentConversation.tsx");

test("成果卡只有 B3 那四块内容，动作是编辑/保存到我的笔记/复制",()=>{
 for(const part of ["本次目标","我的答案","本题表现","还没解决","下一步","编辑","保存到我的笔记","复制"])expect(card).toContain(part);
 // 「一个」未解决点与「一个」下一步：卡片不接受清单
 expect(card).toContain("shown.openIssue");expect(card).toContain("shown.nextStep");
 expect(card).not.toMatch(/openIssues|nextSteps/);
});

test("§8.2 状态四档齐全，失败保留草稿并可重试",()=>{
 for(const state of ["草稿","正在保存","已保存","保存失败"])expect(card).toContain(state);
 expect(card).toContain('setState("failed")');
 // 失败时不清空用户写的内容：draft 是本地 state，只有用户自己改得动
 expect(cardFlat).toContain("const[draft,setDraft]=useState(outcome.answerDraft)");
 expect(card).toContain("失败，重试");
});

test("保存/编辑/复制都不产生新的模型调用，也不归档这次对话",()=>{
 expect(card.match(/fetch\(/g)).toHaveLength(2);
 expect(card.match(/\/api\/coach\/agent[\w/-]*/g)).toEqual(["/api/coach/agent/outcomes","/api/coach/agent/outcomes"]);
 expect(card).not.toMatch(/archive|metered/i);
 expect(card).toContain("navigator.clipboard.writeText");
});

test("已保存要给出真实 ID 与找回入口；正文是可读文本，不是 JSON",()=>{
 expect(card).toContain("已存进「我的笔记」");
 expect(card).toContain("{saved.sessionId}");
 expect(cardFlat).toContain("本次目标：${outcome.goal}");
 expect(cardFlat).not.toContain("JSON.stringify(outcome");
});

test("卡片由本轮台账里的成果驱动：实时一轮与刷新回读走同一条路",()=>{
 expect(flat(conversation)).toContain("t.learning_trace?.outcome&&<OutcomeCard");
 expect(conversation).toContain("outcome={t.learning_trace.outcome}");
 // 校验没过时正文仍在，话要说出来（不静默吞掉）
 expect(flat(conversation)).toContain("!t.learning_trace?.outcome&&t.learning_trace?.outcomeNote");
 // 卡片跟在回答之后，不浮在输入框上
 expect(conversation.indexOf("<OutcomeCard")).toBeGreaterThan(conversation.indexOf('aria-label="复制导师回答"'));
 expect(conversation.indexOf("<OutcomeCard")).toBeLessThan(conversation.indexOf("<form onSubmit"));
});

test("用户手写修改只升内容版本，界面不把它说成新的能力证据",()=>{
 expect(cardFlat).toContain("reviseOutcome(base,draft)");
 expect(card).toContain("你改过，本题表现不变");
 expect(card).toContain("不是永久能力认证");
});
