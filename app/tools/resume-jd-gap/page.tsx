import type { Metadata } from 'next';
import ResumeJdGapClient from './ResumeJdGapClient';
import { GAP_FAQS } from '@/lib/resume-gap/workflow';
import { PUBLIC_SITE_URL } from '@/lib/public-discovery';
import Link from 'next/link';
import styles from './ResumeJdGap.module.css';

const PAGE_URL = `${PUBLIC_SITE_URL}/tools/resume-jd-gap`;

export const metadata: Metadata = {
  metadataBase: new URL(PAGE_URL),
  title: '简历与 JD 对照：核对岗位门槛和经历证据｜益职 AI',
  description:
    '把简历和目标 JD 贴进来，在本机做词面对照：标出 JD 里出现、简历里没对上的词，以及年限、学历、语言、地点等门槛有没有写到。没命中不等于没有能力，也不是 ATS 打分。免登录，文字不上传、不调模型。',
  keywords: [
    '简历匹配JD',
    '简历关键词对照',
    'JD 硬性要求 怎么看',
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
  mainEntity: GAP_FAQS.map(({ question, answer }) => ({
    '@type': 'Question', name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
};

export default function ResumeJdGapPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <ResumeJdGapClient>
      <article className={styles.explainer} aria-labelledby="gap-method-title">
        <div className={styles.container}>
          <p className={styles.byline}>益职编辑整理 · 更新于 <time dateTime="2026-10-21">2026年10月21日</time></p>
          <h2 id="gap-method-title">对照 JD，不是把关键词塞进简历。</h2>
          <p>这张清单帮助你决定先核实什么，再改哪里。工具在浏览器内按固定词典与规则计算；它不能验证实际工作能力、覆盖所有职业，或预测招聘方是否录用。</p>
          <ol className={styles.methodSteps}>
            <li><strong>先看门槛。</strong>逐条阅读完整 JD，确认经验年限、学历、地点与其他明确要求。没找到原文不等于不符合；表述也不能把2年经验变成3年。</li>
            <li><strong>再找对应经历。</strong>把你实际做过的动作、交付物与岗位要求对上。词面命中只是线索，相近经历仍需确认范围，没做过的不补成已有能力。</li>
            <li><strong>最后改表达。</strong>优先写清具体动作与可核验结果。有可靠数字就写，没有数字也可以写对象、范围、频次或交付用途，不编比例和业绩。</li>
          </ol>
          <section className={styles.workedExample} aria-labelledby="gap-example-title">
            <h3 id="gap-example-title">一个完整例子：有转化结果，不等于做过 A/B 测试</h3>
            <p className={styles.byline}>以下为虚构教学案例，不是用户简历或效果承诺。</p>
            <dl>
              <div><dt>岗位要求</dt><dd>通过数据分析、A/B 测试改善预约转化率。</dd></div>
              <div><dt>已知事实</dt><dd>与研发协作上线预约流程，转化率从12%提升至16%；尚未说明实验方法和个人分工。</dd></div>
              <div><dt>可以保留的表达</dt><dd>与研发协作上线预约流程，转化率由12%变为16%。</dd></div>
              <div><dt>为什么这样写</dt><dd>保留协作上线与指标变化这两项已知事实，不把指标变化直接归因于改版，也不添加个人主导权。</dd></div>
              <div><dt>不能擅自补写</dt><dd>“主导 A/B 测试，使转化率提升33%”。现有材料没有随机分组、统计口径或主导权的证据，也不足以证明因果。</dd></div>
              <div><dt>下一问</dt><dd>这次是上线前后对比，还是将用户随机分组的试验？</dd></div>
            </dl>
          </section>
          <p>清单里的经历确认和补充仍只保留在当前页面；复制或下载后可自行保存。刷新会清空输入，不等于保存到益职工作区。</p>
          <p>缺少可靠数字时，可以接着读<Link href="/guides/resume-without-metrics">没有业绩数字的简历写法</Link>；刚面完试，可以用<Link href="/tools/interview-review">四问面试复盘模板</Link>先记下卡住的位置。</p>
          <p><Link href="/login?redirect=%2Fcockpit">进入网页导师继续讨论</Link>，或<Link href="/agent">在自己的 Agent 中使用益职方法</Link>。此页材料不会自动传过去。</p>
        </div>
      </article>
      </ResumeJdGapClient>
    </>
  );
}
