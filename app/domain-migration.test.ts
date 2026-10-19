import config from "../next.config";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("旧书签进入新域，过渡期不吞已在途 OAuth/支付 API 回调", async () => {
  const redirects = await config.redirects!();
  expect(redirects.map(rule => rule.source)).toEqual(["/", "/agent", "/agent/:path+", "/tools/:path*", "/privacy", "/llms.txt",
    "/login", "/cockpit/:path*", "/admin/:path*", "/invite/:path*", "/redeem/:path*", "/onboarding/:path*", "/resume-score/:path*",
    "/api/auth/watcha/authorize", "/api/tokenpay/authorize"]);
  expect(redirects.filter(rule => rule.source.startsWith("/api")).map(rule => rule.source))
    .toEqual(["/api/auth/watcha/authorize", "/api/tokenpay/authorize"]);
  expect(redirects.some(rule => rule.source.includes("callback"))).toBe(false);
  expect(redirects.every(rule => rule.destination.startsWith(`${PUBLIC_SITE_URL}`))).toBe(true);
  for (const rule of redirects) {
    expect(rule).toMatchObject({ permanent: false, has: [{ type: "host", value: "(?:www\\.)?ai-job-coach\\.xin" }] });
    const hostPattern = new RegExp(`^${rule.has![0].value}$`);
    expect(hostPattern.test("www.ai-job-coach.xin")).toBe(true);
    expect(hostPattern.test("ai-job-coach.xin")).toBe(true);
    expect(hostPattern.test("yizhioffer.com")).toBe(false);
    expect(hostPattern.test("www.ai-job-coach.xin.attacker.invalid")).toBe(false);
  }
});
test("新部署运行配置和 Agent 更新入口不再依赖旧域", () => {
  for (const path of ["lib/tokenpay.ts", ".env.example", "scripts/install-agent.sh",
    ".agents/plugins/plugins/yi-zhi/mcp/server.mjs", ".agents/plugins/plugins/yi-zhi/release.json",
    ".agents/plugins/plugins/yi-zhi/.codex-plugin/plugin.json"]) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).not.toMatch(/https?:\/\/(?:www\.)?ai-job-coach\.xin/);
  }
});
test("Agent 发现页与 Eval 内部导航不再强制用户回旧域", () => {
  const guide = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");
  expect(guide).toContain(`Website: ${PUBLIC_SITE_URL}`);
  expect(guide).toContain(`${PUBLIC_SITE_URL}/agent`);
  const evalHtml = readFileSync(join(process.cwd(), "public/eval-lab/index.html"), "utf8");
  expect(evalHtml).toContain('href="/admin/evals"');
  expect(evalHtml).not.toContain('href="https://www.ai-job-coach.xin/');
});
