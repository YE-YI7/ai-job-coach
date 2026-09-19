import type { Metadata } from 'next';
import ResumeJdGapClient from './ResumeJdGapClient';

const PAGE_URL = 'https://www.ai-job-coach.xin/tools/resume-jd-gap';

export const metadata: Metadata = {
  metadataBase: new URL(PAGE_URL),
  title: '简历对不上 JD？逐条找出缺的关键词和硬门槛（附补法）',
  description:
    '把简历和目标 JD 贴进来，本地即时对照：JD 出现但简历没命中的关键词、经验年限/学历/语言/地点等硬门槛逐条核验、疑似缺量化证据的条目。免费免登录，文字不上传、不调模型。',
  keywords: [
    '简历匹配JD',
    '简历关键词对照',
    'JD 硬性要求 怎么看',
    'ATS 简历 关键词',
    '简历缺关键词怎么办',
    '经验年限 学历 门槛',
    '简历量化 数据 例子',
    '益职AI',
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: '简历对不上 JD？逐条找出缺的关键词和硬门槛',
    description:
      '免费、免登录、纯本地对照：关键词缺口 + 硬门槛核验 + 量化证据提醒。结果仅供参考，不替你编经历。',
    url: PAGE_URL,
    siteName: '益职AI',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '简历对不上 JD？逐条找出缺的关键词和硬门槛',
    description: '贴进简历和 JD，本地即时对照缺口。免费免登录，不上传、不调模型。',
  },
  robots: {
    index: true,
    follow: true,
  },
};

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '这个对照器的 ATS 打分准吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '本页只做词面命中对照，用来快速暴露简历和 JD 之间明显的用词差距，不等于任何一家公司 ATS 的真实判定，也不产出分数。各家 ATS 的分词、权重和硬性过滤规则都不公开。',
      },
    },
    {
      '@type': 'Question',
      name: 'JD 里有、我没做过的关键词，能写进简历吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '不能。没做过的写上去等于给自己挖面试坑，一追问就穿帮。正确做法是：把真实做过、且与那个关键词最接近的经历，用对方的说法重写；完全没有的，老实标成待学习项，靠可迁移证据补。',
      },
    },
    {
      '@type': 'Question',
      name: '改简历是堆关键词，还是命中真实经历？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '两者都要，但顺序不能反：先盘出真实经历，再对照 JD 的用词习惯，把同一段经历换成招聘方语言。堆关键词而经历撑不住，能过初筛也过不了面试。',
      },
    },
    {
      '@type': 'Question',
      name: '一份简历投多个岗位，要各改一版吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '方向相同、关键词高度重叠的岗位可以共用一版主简历；跨方向或跨业务线的岗位值得各出一版：主体经历不变，只重排顺序、替换措辞、补该岗位最看重的证据。',
      },
    },
  ],
};

export default function ResumeJdGapPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <ResumeJdGapClient />
    </>
  );
}
