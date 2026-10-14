import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";

export const metadata: Metadata = {
  title: "益职 AI｜你的 AI 求职导师，简历修改与面试辅导",
  description: "从改好一份简历，到答好下一场面试。益职保留你的经历、对话与进展；没有目标岗位，也能先改简历。先看互动演示，或使用免登录的简历对照与 Offer 比较工具。",
  alternates: { canonical: PUBLIC_SITE_URL },
  openGraph: {
    title: "益职 AI｜你的 AI 求职导师",
    description: "从改好一份简历，到答好下一场面试。记得你的经历，也保留每一步进展。",
    url: PUBLIC_SITE_URL, locale: "zh_CN", type: "website",
    images: [{ url: `${PUBLIC_SITE_URL}/logo.png`, alt: "益职 AI" }],
  },
};

export default function Home() { return <HomeClient />; }
