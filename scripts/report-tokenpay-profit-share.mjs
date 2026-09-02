const apiKey = process.env.TOKENDANCE_PRODUCT_API_KEY?.trim();
const applicationId = process.env.TOKENDANCE_APPLICATION_ID?.trim() || "01M1ERJDR1EGTJS4H338BMZFV8";

if (!apiKey) {
  console.error("缺少 TOKENDANCE_PRODUCT_API_KEY；请使用益职 AI 产品方账号的 TokenDance API Key。不要使用用户 OAuth Key。 ");
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15_000);

try {
  const response = await fetch(
    `https://tokendance.space/portal/api/v1/applications/${encodeURIComponent(applicationId)}/profit-share/pricing`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    },
  );
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message || parsed?.message || body;
    } catch {}
    throw new Error(`TokenDance 分润价目查询失败（${response.status}）：${message || "未知错误"}`);
  }
  process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error("TokenDance 分润价目查询超时");
  } else {
    console.error(error instanceof Error ? error.message : "TokenDance 分润价目查询失败");
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
