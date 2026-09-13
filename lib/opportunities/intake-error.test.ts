import {intakeErrorMessage} from "./intake-error";
test("database plain-object timeout is not blamed on pasted text",()=>{
 expect(intakeErrorMessage({message:"Gateway Timeout"})).toContain("服务暂时超时");
 expect(intakeErrorMessage({message:"Gateway Timeout"})).toContain("不需要重新粘贴");
});
test("validation instructions survive but unknown internal details do not leak",()=>{
 expect(intakeErrorMessage(Error("文件不能超过 10MB"))).toBe("文件不能超过 10MB");
 expect(intakeErrorMessage(Error("internal table foo"))).not.toContain("foo");
});
