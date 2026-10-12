// 本地托管、已目视核对的官网品牌资产。不使用猜测域名的第三方 Logo 服务。
export const COMPANY_LOGOS = {
  腾讯: { path: "/company-logos/tencent.png", source: "https://www.tencent.com/wp-content/themes/tencent-web/assets/favicon/apple-touch-icon.png" },
  网易: { path: "/company-logos/netease.png", source: "https://static.ws.126.net/www/logo/logo-ipad-icon.png" },
  京东: { path: "/company-logos/jd.png", source: "https://www.jd.com/favicon.ico" },
  百度: { path: "/company-logos/baidu.png", source: "https://www.baidu.com/favicon.ico" },
  小米: { path: "/company-logos/xiaomi.png", source: "https://www.mi.com/favicon.ico" },
  美团: { path: "/company-logos/meituan.png", source: "https://www.meituan.com/favicon.ico" },
  快手: { path: "/company-logos/kuaishou.png", source: "https://www.kuaishou.com/favicon.ico" },
  Kimi: { path: "/company-logos/kimi.png", source: "https://www.kimi.com/pwa-192.png" },
  Manus: { path: "/company-logos/manus.png", source: "https://manus.im/favicon.ico" },
} as const;
export function companyLogo(company: string): string | null {
  return Object.hasOwn(COMPANY_LOGOS, company) ? COMPANY_LOGOS[company as keyof typeof COMPANY_LOGOS].path : null;
}
