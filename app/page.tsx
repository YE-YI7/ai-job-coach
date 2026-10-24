import type { Metadata } from "next";
import HomeLanding, { HOME_FAQS } from "./HomeLanding";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";

export const metadata: Metadata = {
  title: "益职 AI｜陪你，一直到找到工作",
  description:
    "从一句求职困惑开始，一起读岗位、补证据、改简历和练面试。益职保留经历、对话与当前安排，帮你找到今天能推进的一步；不编经历，不承诺 offer。",
  alternates: { canonical: PUBLIC_SITE_URL },
  openGraph: {
    title: "益职 AI｜陪你，一直到找到工作",
    description:
      "从改好一份简历，到答好下一场面试。记得你的经历，也保留每一步进展。",
    url: PUBLIC_SITE_URL,
    locale: "zh_CN",
    type: "website",
    images: [{ url: `${PUBLIC_SITE_URL}/logo.png`, alt: "益职 AI" }],
  },
};

export default function Home() {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faq).replace(/</g, "\\u003c"),
        }}
      />
      <HomeLanding />
    </>
  );
}
