import fs from "node:fs";
import path from "node:path";
import {chatFailureMessage,CHAT_FAILURE_TABLE,classifyChatFailure,resolveCooldownRetry,type ChatFailureClass} from "./chat-failure";
import {classifyGenerationFailure} from "../llm-telemetry";
import {ECONOMY_MODEL_ID} from "./model-catalog";
test.each(["Request timed out.","LLM_REQUEST_TIMEOUT","Request aborted"])("classifies %s without swallowing recovery",message=>{
 expect(chatFailureMessage(new Error(message))).toContain("超时");
 expect(classifyGenerationFailure(new Error(message))).toBe("timeout");
});
test("does not leak upstream details and preserves TokenPay recovery",()=>{
 expect(chatFailureMessage(new Error("secret provider payload"))).not.toContain("secret");
 expect(chatFailureMessage(new Error("TokenPay 余额不足，请充值后重试"))).toContain("充值");
});

describe("失败语义表（§5.7 逐行可测）",()=>{
 test("每行都写全四列：失败类 / 用户看到什么 / 是否重试 / 是否落库",()=>{
  for(const row of CHAT_FAILURE_TABLE){
   expect(typeof row.failure).toBe("string");
   expect(["string","function"]).toContain(typeof row.userCopy);
   expect(["auto_per_routing","manual","none"]).toContain(row.retryable);
   expect(typeof row.persists).toBe("boolean");
  }
 });
 test("设计表七行全部在册：出字前超时/中断、关键料装不下、quote 回指失败、子 Agent 失败、落库失败、压缩保护区缺失",()=>{
  const failures=CHAT_FAILURE_TABLE.map(r=>r.failure);
  const required:ChatFailureClass[]=["model_timeout","stream_interrupted","context_budget_exceeded","quote_verification_failed","subagent_failed","persistence_failed","compression_protection_lost"];
  for(const f of required)expect(failures).toContain(f);
 });
 test("降级动作口径：出字后中断与关键料装下一律不自动重试；只有未出字的超时/不可用走路由策略",()=>{
  const byFailure=new Map(CHAT_FAILURE_TABLE.map(r=>[r.failure,r]));
  expect(byFailure.get("model_timeout")!.retryable).toBe("auto_per_routing");
  expect(byFailure.get("model_unavailable")!.retryable).toBe("auto_per_routing");
  expect(byFailure.get("stream_interrupted")!.retryable).toBe("none");
  expect(byFailure.get("context_budget_exceeded")!.retryable).toBe("none");
  expect(byFailure.get("quote_verification_failed")!.retryable).toBe("none");
  expect(byFailure.get("persistence_failed")!.persists).toBe(false);
  expect(byFailure.get("context_budget_exceeded")!.persists).toBe(false);
  expect(byFailure.get("repetition_abort")!.persists).toBe(false);
 });
 test("chatFailureMessage 的历史分支逐字不变（分类顺序 = 历史匹配顺序）",()=>{
  expect(chatFailureMessage(new Error("导师输出重复，已停止本次回答，请重试"))).toBe("导师输出重复，已停止本次回答且未保存。请重试或更换模型。");
  expect(chatFailureMessage(new Error("429 Too Many Requests"))).toContain("请求较多");
  expect(chatFailureMessage(new Error("所选模型不可用"))).toContain("选择其他模型");
  expect(chatFailureMessage(new Error("upstream empty response"))).toContain("未完成回答");
  expect(chatFailureMessage("非 Error 输入")).toBe("本次回答未完成，请保留问题并重试");
  // TokenPay 最先命中且原文透传：授权/余额问题绝不被告成「超时」。
  expect(classifyChatFailure(new Error("TokenPay timeout"))).toBe("provider_quota");
 });
 test("关键料装不下：透传自家话术，说清是哪类材料超长（§5.7 第 3 行落地）",()=>{
  const message="关键内容装不进 12000 token 预算：opportunity [job-1] 需要 15000 token。请拆任务或选择要保留的材料。";
  expect(classifyChatFailure(new Error(message))).toBe("context_budget_exceeded");
  expect(chatFailureMessage(new Error(message))).toBe(message);
 });
 test("简历复核未通过：不给没有出处的用户事实（§5.7 第 4 行落地）",()=>{
  expect(classifyChatFailure(new Error("简历事实复核未通过"))).toBe("quote_verification_failed");
  expect(chatFailureMessage(new Error("简历事实复核未通过"))).toContain("没有出处");
 });
});

describe("冷却重试档位（不再写死模型字面量）",()=>{
 const timeout=new Error("Request timed out.");
 test("auto 档未出字的超时 → 返回 model-catalog 的经济档常量",()=>{
  const target=resolveCooldownRetry({mode:"auto",receivedText:false,currentModel:"glm-5.3",error:timeout});
  expect(target).toBe(ECONOMY_MODEL_ID);
 });
 test("已出字不自动重试；非 auto 不换用户的模型；已在经济档不再换；非超时类不重试",()=>{
  expect(resolveCooldownRetry({mode:"auto",receivedText:true,currentModel:"glm-5.3",error:timeout})).toBeNull();
  expect(resolveCooldownRetry({mode:"fast",receivedText:false,currentModel:"glm-5.3",error:timeout})).toBeNull();
  expect(resolveCooldownRetry({mode:"auto",receivedText:false,currentModel:ECONOMY_MODEL_ID,error:timeout})).toBeNull();
  expect(resolveCooldownRetry({mode:"auto",receivedText:false,currentModel:"glm-5.3",error:new Error("简历事实复核未通过")})).toBeNull();
 });
 test("machine check：chat-failure.ts 源码里没有任何写死的模型 id 字面量",()=>{
  const source=fs.readFileSync(path.join(__dirname,"chat-failure.ts"),"utf8");
  expect(source).not.toMatch(/deepseek-v4-flash/);
  expect(source).toMatch(/ECONOMY_MODEL_ID/);
 });
});
