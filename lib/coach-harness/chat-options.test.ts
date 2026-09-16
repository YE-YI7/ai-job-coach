import {chooseChatModel,isChatMode,parseTutorReply,CHAT_MODELS} from "./chat-options";
test("tutor-to-user prompts are not offered as user replies",()=>{
 expect(parseTutorReply('内容<followups>["你能举个例子吗？","请带我拆解这个指标"]</followups>').suggestions).toEqual(["请带我拆解这个指标"]);
});
test("followups do not fabricate user actions or mastery",()=>{
 expect(parseTutorReply('内容<followups>["我画了界面草图","我已经掌握了","请带我做评测"]</followups>').suggestions).toEqual(["请带我做评测"]);
});
test("automatic mode uses task-specific eligible models",()=>{
 expect(chooseChatModel("auto","面试练习",[...CHAT_MODELS])).toBe("kimi-k3");
 expect(chooseChatModel("auto","RAG召回评测",[...CHAT_MODELS])).toBe("glm-5.3");
 expect(chooseChatModel("auto","改简历",[...CHAT_MODELS])).toBe("qwen3.8-max-0902");
});
test("unknown or unavailable model is not silently accepted",()=>{
 expect(isChatMode("unverified-latest")).toBe(false);
 expect(chooseChatModel("kimi-k3","",[])).toBeNull();
 expect(chooseChatModel("auto","",[])).toBe("deepseek-v4-flash");
});
test("economy mode stays on the low-cost incumbent",()=>expect(chooseChatModel("fast","复杂架构",[...CHAT_MODELS])).toBe("deepseek-v4-flash"));
test("followups are linked to the actual model reply and never static fallbacks",()=>{
 expect(parseTutorReply('先核实排队时间。<followups>["怎么测排队时间？","访谈该问谁？"]</followups>')).toEqual({answer:"先核实排队时间。",suggestions:["怎么测排队时间？","访谈该问谁？"]});
 expect(parseTutorReply("没有后续问题").suggestions).toEqual([]);
});
test("invalid followups are dropped without exposing protocol text",()=>{
 expect(parseTutorReply("回答<followups>unfinished")).toEqual({answer:"回答",suggestions:[]});
 expect(parseTutorReply('回答<followups>["请继续","请继续",4,"我想看例子","帮我练习"]</followups>').suggestions).toEqual(["请继续","我想看例子"]);
});
