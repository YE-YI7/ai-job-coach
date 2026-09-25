/** Public recovery copy; never leak raw upstream payloads or credentials. */
export function chatFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/TokenPay/.test(message)) return message;
  if (/timeout|timed\s*out|abort/i.test(message)) return "模型响应超时。问题仍保留在输入框，可重试或选择其他模型。";
  if (/429|rate.?limit/i.test(message)) return "模型当前请求较多，请稍后重试或选择其他模型。";
  if (/模型.*不可用|模型不存在|未替换模型/.test(message)) return "所选模型暂不可用，请选择其他模型后重试。";
  if (/empty response|输出中断/i.test(message)) return "模型未完成回答，请重试或选择其他模型。";
  return "本次回答未完成，请保留问题并重试";
}
