import {chatFailureMessage} from "./chat-failure";
import {classifyGenerationFailure} from "../llm-telemetry";
test.each(["Request timed out.","LLM_REQUEST_TIMEOUT","Request aborted"])("classifies %s without swallowing recovery",message=>{
 expect(chatFailureMessage(new Error(message))).toContain("超时");
 expect(classifyGenerationFailure(new Error(message))).toBe("timeout");
});
test("does not leak upstream details and preserves TokenPay recovery",()=>{
 expect(chatFailureMessage(new Error("secret provider payload"))).not.toContain("secret");
 expect(chatFailureMessage(new Error("TokenPay 余额不足，请充值后重试"))).toContain("充值");
});
