import {intakeErrorMessage,isHostedIntakeQuotaFailure} from "./intake-error";
test("hosted exhaustion is sanitized and not blamed on the user's allowance",()=>{
 const error=Error("LLM API 调用失败: 402 Insufficient Balance (request_id: private-id)");
 expect(isHostedIntakeQuotaFailure(error)).toBe(true);
 expect(intakeErrorMessage(error)).toContain("不是你的免费次数");
 expect(intakeErrorMessage(error)).not.toContain("private-id");
 expect(isHostedIntakeQuotaFailure(Error("TokenPay 余额不足"))).toBe(false);
 expect(isHostedIntakeQuotaFailure(Error("invalid api key"))).toBe(false);
});
test("database plain-object timeout is not blamed on pasted text",()=>{
 expect(intakeErrorMessage({message:"Gateway Timeout"})).toContain("服务暂时超时");
 expect(intakeErrorMessage({message:"Gateway Timeout"})).toContain("不需要重新粘贴");
});
test("validation instructions survive but unknown internal details do not leak",()=>{
 expect(intakeErrorMessage(Error("文件不能超过 10MB"))).toBe("文件不能超过 10MB");
 expect(intakeErrorMessage(Error("internal table foo"))).not.toContain("foo");
});
