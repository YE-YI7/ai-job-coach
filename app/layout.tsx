import type { Metadata } from "next";
// 移除 Google Fonts 导入，避免构建时的网络请求
// import { Geist, Geist_Mono, Arimo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "益职 AI｜网页求职作战盘与本地 Agent 免费版",
  description: "在益职网页直接管理求职作战盘，或让自己的 Agent 在本地沙箱中免费运行。",
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body 
        className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
