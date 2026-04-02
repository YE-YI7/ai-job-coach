import type { Metadata } from 'next';

const metadataBase = new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-job-coach.xin');

export const metadata: Metadata = {
  metadataBase,
  title: 'AI 简历健康度扫描｜免费 ATS 简历评分 - 益职AI',
  description:
    '上传 PDF、Word、TXT 简历或直接粘贴内容，5 秒获得 ATS 健康度评分、五维度诊断与优化建议。',
  keywords: [
    'AI简历评分',
    'ATS简历检测',
    '简历优化',
    '简历健康度扫描',
    '简历诊断',
    '求职简历优化',
    '益职AI',
  ],
  alternates: {
    canonical: '/resume-score',
  },
  openGraph: {
    title: 'AI 简历健康度扫描｜免费 ATS 简历评分',
    description: '免费上传简历，一键获得 ATS 评分、五维度诊断和优化建议。',
    url: '/resume-score',
    siteName: '益职AI',
    locale: 'zh_CN',
    type: 'website',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: '益职AI 简历健康度扫描',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 简历健康度扫描｜免费 ATS 简历评分',
    description: '上传简历，快速拿到 ATS 健康度评分与优化建议。',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ResumeScoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
