import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI Job Coach - 智能求职助手",
  description: "全流程智能求职助手，帮助优化简历、准备面试、进行薪资谈判等求职相关任务",
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
