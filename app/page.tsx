import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";

export const metadata: Metadata = {
  title: "益职 AI｜简历与岗位对照、面试辅导、Offer 比较",
  description: "先免费对照简历与岗位要求，或比较两份 Offer；无需登录。需要进一步修改简历、练习面试时，再进入益职 AI 求职辅导。",
  alternates: { canonical: PUBLIC_SITE_URL },
  openGraph: {
    title: "益职 AI｜从一个具体的求职问题开始",
    description: "简历与岗位对照、Offer 比较，无需登录先体验。",
    url: PUBLIC_SITE_URL, locale: "zh_CN", type: "website",
    images: [{ url: `${PUBLIC_SITE_URL}/logo.png`, alt: "益职 AI" }],
  },
};

export default function Home() { return <HomeClient />; }
