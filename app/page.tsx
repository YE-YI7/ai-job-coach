import type { Metadata } from "next";
import HomeLanding, { HOME_FAQS } from "./HomeLanding";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";

export const metadata: Metadata = {
  title: "益职 AI｜你的 AI 求职导师，简历修改与面试辅导",
  description: "简历、目标岗位、找岗位或一句困惑都能开始。益职保留你的经历、对话和当前安排，一起补证据、改简历、练面试；也可先试免登录互动演示。",
  alternates: { canonical: PUBLIC_SITE_URL },
  openGraph: {
    title: "益职 AI｜你的 AI 求职导师",
    description: "从改好一份简历，到答好下一场面试。记得你的经历，也保留每一步进展。",
    url: PUBLIC_SITE_URL, locale: "zh_CN", type: "website",
    images: [{ url: `${PUBLIC_SITE_URL}/logo.png`, alt: "益职 AI" }],
  },
};

export default function Home() {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map(item => ({
      "@type": "Question", name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }} />
    <HomeLanding />
  </>;
}
