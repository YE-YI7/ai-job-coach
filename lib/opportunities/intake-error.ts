/** Hosted exhaustion is an operator problem, not the user's free-use allowance. */
export function isHostedIntakeQuotaFailure(error: unknown) {
 const message=error instanceof Error?error.message:"";
 return !/TokenPay/i.test(message)&&/insufficient.?balance|insufficient_quota|API 配额不足/i.test(message);
}
export function intakeErrorMessage(error:unknown) {
 if(isHostedIntakeQuotaFailure(error))return "站点的 AI 服务额度暂时用完，材料仍保留；不是你的免费次数用完。";
 const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
 if(/timeout|timed out|gateway|fetch failed|connection/i.test(message))return "服务暂时超时，材料仍保留在输入框里。请稍后再次提交，不需要重新粘贴。";
 return /请|不能|不支持|无法|没有|太大/.test(message)?message:"材料暂时未能处理，输入内容已保留，请稍后再次提交。";
}
