import type { Metadata } from 'next';
import OfferCompareClient from './OfferCompareClient';

const PAGE_URL = 'https://www.ai-job-coach.xin/tools/offer-compare';

export const metadata: Metadata = {
  metadataBase: new URL(PAGE_URL),
  title: 'Offer 对比计算器：总包·税后到手·时薪 一次性算清（2026）',
  description:
    '贴进 2–3 个 offer 的月薪、年终奖、公积金基数、签字费、期权，实时算出年包、税后到手、时薪和跳槽首年净差额。数字均为估算，结果可存进你的求职作战盘一起比成长与风险。',
  keywords: [
    'offer 对比计算器',
    '两个 offer 选哪个',
    '总包怎么算',
    '月薪换算年包',
    '跳槽首年到手',
    '五险一金基数 税后',
    '签字费 期权 总包',
    '益职AI',
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: 'Offer 对比计算器：总包·税后到手·时薪 一次性算清',
    description:
      '免费、免登录。贴进 2–3 个 offer，实时换算可比口径并给出差异归因。数字均为估算，以实际账单与当地社保公积金为准。',
    url: PAGE_URL,
    siteName: '益职AI',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Offer 对比计算器：总包·税后到手·时薪 一次性算清',
    description: '免费免登录，把 2–3 个 offer 换成可比口径。',
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
      name: '两个 offer 总包一样选哪个？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '总包相同不代表到手相同：公积金基数与比例、期权可否变现与归属节奏都会拉开差距。用计算器把基数、比例、周工时分别填进去比到手和时薪，接近时再比岗位内容、leader 与晋升节奏。',
      },
    },
    {
      '@type': 'Question',
      name: '签字费要不要算进总包？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '只算进首年口径。签字费是一次性的，并入持续年包会虚高长期基准，且常附带提前离职退还条款。',
      },
    },
    {
      '@type': 'Question',
      name: '期权怎么并进年包？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '按你估计的年化税前额线性并入，计算器不做计税、折现与归属风险模拟，未归属部分要打折看待。',
      },
    },
    {
      '@type': 'Question',
      name: '五险一金按最低基数交会差多少？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '到手看似多，但公积金账户留存与后续待遇缩水。把社保公积金基数改成公司实际申报值重算即可看到差距，所有结果为估算，以当地政策与实际账单为准。',
      },
    },
    {
      '@type': 'Question',
      name: '大小周怎么算时薪？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '把大小周折算成每周实际工作小时数，时薪 = 年税后到手 ÷（周工时 × 52），同样年薪下工时更长的 offer 时薪会被稀释。',
      },
    },
  ],
};

export default function OfferComparePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <OfferCompareClient />
    </>
  );
}
