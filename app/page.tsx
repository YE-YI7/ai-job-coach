import type { Metadata } from "next";
import HomeLanding from "./HomeLanding";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";

export const metadata: Metadata = {
  title: "益职 AI｜以岗位为主线的 AI 求职作战盘",
  description: "从一个确定开始，把其他不确定练到确定。益职把 JD 拆成岗位判断、证据缺口和今天下一步；简历与面试准备围绕同一个岗位，不再从零解释自己。免登录可试。",
  alternates: { canonical: PUBLIC_SITE_URL },
  openGraph: {
    title: "益职 AI｜以岗位为主线的 AI 求职作战盘",
    description: "从一个确定开始，把其他不确定练到确定。先判断岗位，再补证据、改简历、准备面试。",
    url: PUBLIC_SITE_URL, locale: "zh_CN", type: "website",
    images: [{ url: `${PUBLIC_SITE_URL}/logo.png`, alt: "益职 AI" }],
  },
};

const faq = [
  { q: "益职和简历工具有什么区别？", a: "简历工具先让你改简历；益职先把岗位拆成判断、证据缺口和今天该做的一步，简历与面试准备都围绕这个岗位，不从零解释自己。" },
  { q: "和直接用 ChatGPT 有什么不同？", a: "ChatGPT 更擅长单次对话；益职保留岗位对象、已确认事实、简历版本和下一步，并在截止时间、面试临近或岗位停滞时主动提醒。关键事实要你确认，未确认的内容不会写进产物。" },
  { q: "没有 JD 也能开始吗？", a: "可以。只有简历时先把简历存进工作区，再一起判断方向；还没方向时先说一句困惑，导师一次只问一个最影响选择的问题。没有 JD 不会生成没有依据的匹配分。" },
  { q: "会保存我的简历吗？", a: "免登录工具在本地完成对照，不上传文字；登录后保存到你的工作区，可随时删除。Agent 版默认只写本地目录。" },
  { q: "Agent 版是什么？收费吗？", a: "用你自己的 Codex、Claude Code 等 Agent 提供模型，益职提供方法与本地作战盘，不额外收模型费用；实际费用取决于你使用的 Agent 平台。" },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "益职 AI",
    url: PUBLIC_SITE_URL,
    logo: `${PUBLIC_SITE_URL}/logo.png`,
    description: "以岗位为主线的 AI 求职作战盘。",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "益职 AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: PUBLIC_SITE_URL,
    description: "先判断岗位值不值得投，再补证据、改简历、准备面试的 AI 求职作战盘。",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  },
];

export default function Home() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <HomeLanding />
  </>;
}
