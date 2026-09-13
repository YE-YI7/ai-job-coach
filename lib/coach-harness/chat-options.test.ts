import {chooseChatModel,isChatMode,parseTutorReply,CHAT_MODELS} from "./chat-options";
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
 expect(parseTutorReply('回答<followups>["a","a",4,"b","c"]</followups>').suggestions).toEqual(["a","b"]);
});
