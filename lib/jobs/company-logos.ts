// 本地托管、已目视核对的官网品牌资产。不使用猜测域名的第三方 Logo 服务。
export const COMPANY_LOGOS = {
  腾讯: { path: "/company-logos/tencent.png", source: "https://www.tencent.com/wp-content/themes/tencent-web/assets/favicon/apple-touch-icon.png" },
  网易: { path: "/company-logos/netease.png", source: "https://static.ws.126.net/www/logo/logo-ipad-icon.png" },
} as const;
export function companyLogo(company: string): string | null {
  return Object.hasOwn(COMPANY_LOGOS, company) ? COMPANY_LOGOS[company as keyof typeof COMPANY_LOGOS].path : null;
}
