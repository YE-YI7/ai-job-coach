import type { Metadata } from "next";
// 移除 Google Fonts 导入，避免构建时的网络请求
// import { Geist, Geist_Mono, Arimo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "益职 AI - 求职作战盘",
  description: "让你的 Agent 和你共同管理岗位、证据、简历与面试。",
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
