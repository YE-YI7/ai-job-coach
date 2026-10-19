import config from "../next.config";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("主域只迁公开入口，不吞旧 OAuth/支付回调、登录或工作区", async () => {
  const redirects = await config.redirects!();
  expect(redirects.map(rule => rule.source)).toEqual(["/", "/agent/:path*", "/tools/:path*", "/privacy", "/llms.txt"]);
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
test("Agent 发现页与 Eval 内部导航不再强制用户回旧域", () => {
  const guide = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");
  expect(guide).toContain(`Website: ${PUBLIC_SITE_URL}`);
  expect(guide).toContain(`${PUBLIC_SITE_URL}/agent`);
  const evalHtml = readFileSync(join(process.cwd(), "public/eval-lab/index.html"), "utf8");
  expect(evalHtml).toContain('href="/admin/evals"');
  expect(evalHtml).not.toContain('href="https://www.ai-job-coach.xin/');
});
