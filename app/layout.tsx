import type { Metadata } from "next";
// 移除 Google Fonts 导入，避免构建时的网络请求
// import { Geist, Geist_Mono, Arimo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "益职AI - 你的私人求职导师",
  description: "全流程智能求职助手，帮助优化简历、准备面试、进行薪资谈判等求职相关任务",
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP meta tag (与 next.config.ts 中的 headers CSP 保持一致)
  const cspMeta = (
    <meta
  httpEquiv="Content-Security-Policy"
  content={[
    "default-src 'self' https: data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/",
    "img-src 'self' data: blob: https:",
    // 允许任意外部上报接口（否则 React 中断）
    "connect-src * ws: wss:",
    "object-src 'none'",
    "frame-ancestors 'self'",
  ].join("; ")}
/>

  );

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {cspMeta}
        {/* TODO: 替换为本地 FontAwesome（安装 @fortawesome/fontawesome-free 后移除此行） */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
      </head>
      <body 
        className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        suppressHydrationWarning
      >
        <div className="ambient-light-1"></div>
        <div className="ambient-light-2"></div>
        <div className="ambient-light-3"></div>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

