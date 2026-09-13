export function intakeErrorMessage(error:unknown) {
 const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
 if(/timeout|timed out|gateway|fetch failed|connection/i.test(message))return "服务暂时超时，材料仍保留在输入框里。请稍后再次提交，不需要重新粘贴。";
 return /请|不能|不支持|无法|没有|太大/.test(message)?message:"材料暂时未能处理，输入内容已保留，请稍后再次提交。";
}
