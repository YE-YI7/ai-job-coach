import type { Metadata } from 'next';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import PublicGuideNav from '@/components/public-guides/PublicGuideNav';
import PublicGuideFooter from '@/components/public-guides/PublicGuideFooter';
import { PUBLIC_SITE_URL } from '@/lib/public-discovery';
import styles from '@/components/public-guides/PublicGuide.module.css';

const PAGE_URL = `${PUBLIC_SITE_URL}/guides/resume-without-metrics`;
const REVIEWED_ON = '2026-10-21';

export const metadata: Metadata = {
  metadataBase: new URL(PAGE_URL),
  title: '简历里没有业绩数字怎么写？对象、动作、产物三步（附改写示例）',
  description:
    '没有量化结果也能写清贡献：写清面对的对象、自己做过的动作、留下的具体产物；参与/负责/主导的责任边界、没有数字时可以写什么、不该补什么，以及改完只需回答的一个问题。免登录可读，不读取你的简历。',
  keywords: [
    '简历 没有数据 怎么写',
    '简历 量化 没有数字',
    '简历 业绩 不知道',
    '简历 协助 负责 主导 区别',
    '简历 交付物 写法',
    '简历 不编造 提升比例',
    '益职AI',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: '简历里没有业绩数字，怎么把事写清楚',
    description:
      '对象、动作、产物三步写法，附一条虚构经历的改写示例与逐句理由。不编提升比例，不拔高责任。',
    url: PAGE_URL,
    siteName: '益职AI',
    locale: 'zh_CN',
    type: 'article',
  },
  twitter: {
    card: 'summary',
    title: '简历里没有业绩数字，怎么把事写清楚',
    description: '对象、动作、产物三步写法，附一条虚构经历的改写示例与理由。',
  },
  robots: { index: true, follow: true },
};

export default function ResumeWithoutMetricsGuidePage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <PublicGuideNav aside={{ href: '/tools/resume-jd-gap', label: '简历对照 JD 找缺口' }} />

        <header className={styles.header}>
          <h1>简历里没有业绩数字，怎么把事写清楚？</h1>
          <p className={styles.lead}>
            没有业绩数字，也能写清三件事：你面对的对象、你自己做过的动作、留下来的具体产物。
            不需要强行量化，更不能编一个提升比例上去。
          </p>
          <p className={styles.credit}>
            <span>益职编辑整理</span>
            <span>核验日期 {REVIEWED_ON}</span>
            <span>
              <ShieldCheck size={14} aria-hidden="true" />
              本页不需要登录，也不会读取或上传你的简历
            </span>
          </p>
        </header>

        <section className={styles.section} aria-labelledby="demo">
          <h2 id="demo">一条没有数字的经历，怎么改</h2>
          <p>
            下面是一段虚构的教学材料，不对应任何真实的人或公司。
            先看材料里能确认什么，再决定句子怎么写。
          </p>
          <dl className={styles.revision}>
            <div className={styles.revisionRow}>
              <dt>原文这样写</dt>
              <dd className={styles.original}>协助整理用户反馈，提升产品体验</dd>
            </div>
            <div className={styles.revisionRow}>
              <dt>材料里能确认的事实</dt>
              <dd className={styles.fact}>整理客服反馈，将重复问题分类为清单，供产品每周评审</dd>
            </div>
            <div className={styles.revisionRow}>
              <dt>改后</dt>
              <dd className={styles.revised}>整理客服反馈并归类重复问题，形成每周产品评审清单</dd>
            </div>
            <div className={styles.revisionRow}>
              <dt>为什么这样改</dt>
              <dd className={styles.reason}>
                这条材料已明确本人做过整理和分类，因此直接写这两项动作；并不是所有「协助」都该删掉，协作范围不明时仍需保留责任边界。
                「提升产品体验」材料里没有依据，换成「清单」这个看得见的产物；
                「每周评审」是材料里已有的事实，写出来读者就知道这份东西给了谁、用来干什么。
                整句没有一个数字，但比原句更可核对。
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="responsibility">
          <h2 id="responsibility">参与、负责、主导：责任词按材料选</h2>
          <ul className={styles.boundaries}>
            <li>
              <strong>「协助」「参与」不要升成「主导」</strong>
              <p>材料只写了你在协同里做的那一段，就只写那一段。用「主导」需要材料里有决策权和负责范围的依据。</p>
              <p className={styles.yes}>可以写：整理客服反馈并归类重复问题</p>
              <p className={styles.no}>不要写：主导用户反馈体系优化</p>
            </li>
            <li>
              <strong>团队的结果不写成本人独立实现</strong>
              <p>小组交付的东西，写你负责的那部分和它最终的用途；整体成果归属留在团队。</p>
              <p className={styles.yes}>材料能证明本人负责分类口径时，可以写：负责其中的分类口径，供团队评审使用</p>
              <p className={styles.no}>不要写：我一个人完成了整套评审机制</p>
            </li>
            <li>
              <strong>「提出方案」不等于「上线落地」，「预计」不等于「实测」</strong>
              <p>事情推进到哪一步就写到哪一步。停在建议阶段的方案，不要写成已经发生的结果。</p>
              <p className={styles.yes}>可以写：提出按问题类型分组的整理方案</p>
              <p className={styles.no}>不要写：上线后返工率下降</p>
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="substitutes">
          <h2 id="substitutes">没有结果数字时，可以写这四类内容</h2>
          <ul className={styles.boundaries}>
            <li>
              <strong>具体方法</strong>
              <p>你怎么做的：按什么口径分组、用什么方式核对、和谁一起确认。</p>
            </li>
            <li>
              <strong>交付物</strong>
              <p>留下了什么看得见的东西：清单、文档、模板、表格、检查项。</p>
            </li>
            <li>
              <strong>用途和使用方</strong>
              <p>给谁用、用来做什么决定。这一条最容易补，也最能说明事情有价值。</p>
            </li>
            <li>
              <strong>材料里真实写过的范围与频次</strong>
              <p>「每周评审」「覆盖三个渠道」这类只在原文确实写了的时候才用，不要靠猜补出来。</p>
            </li>
          </ul>
          <p className={styles.help}>
            不必每条都凑齐。一处缺少一项指标，不阻塞其他段落先改好。
          </p>
        </section>

        <section className={styles.section} aria-labelledby="avoid">
          <h2 id="avoid">这几样不该往简历里加</h2>
          <ul className={styles.boundaries}>
            <li>
              <strong>编出来的百分比和提升幅度</strong>
              <p>没有测量就没有比例。「不猜月份、不编提升比例」，也不要写「显著」「大幅」来代替数字。</p>
            </li>
            <li>
              <strong>「指标待补」这类占位符</strong>
              <p>内部记录可以留待办，成稿里不要出现，读者会以为简历没写完。</p>
            </li>
            <li>
              <strong>只换动词、补能力标签</strong>
              <p>把「负责」改成「主导」、加一句「深度参与」不算有价值的改稿。原句已经清楚，可以不改。</p>
            </li>
            <li>
              <strong>把别人的好简历当成自己的事实</strong>
              <p>外部样例只能参考取舍和结构，不能把它的数字、公司、技术栈搬进来。</p>
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="one-question">
          <h2 id="one-question">这一句已经可以保留</h2>
          <p>如果还要补一个事实，只问自己：这份清单后来被谁用于什么决定？答不上来就不要再问，也不要补人数、周期或上线状态。</p>
          <div className={styles.oneQuestion}>
            <p>这份清单后来被谁用于什么决定？</p>
            <ul>
              <li>答得上来：把使用方和用途补进句子，比补一个数字更有用。</li>
              <li>答不上来：已经改好的版本仍然是更好的版本，不用为等答案停下。</li>
              <li>不想答：可以跳过，不影响你先把其他段落改完。</li>
            </ul>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="next">
          <h2 id="next">接着做哪一步</h2>
          <ul className={styles.nextLinks}>
            <li>
              <a href="/tools/resume-jd-gap">
                对照 JD 逐条找缺口
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>把简历和目标 JD 贴进去，本地即时对照关键词与硬门槛，文字不上传、不调模型。</span>
            </li>
            <li>
              <a href="/tools/interview-review">
                用免登录模板做面试复盘
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>四个问题把「哪里卡住」记清楚；只在当前页填写，不保存到账号。</span>
            </li>
            <li>
              <a href="/login?redirect=%2Fcockpit">
                登录后让导师逐条改你的简历
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>这一页不会自动把你的材料带过去，登录后需要你重新提供简历原文。</span>
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="sources">
          <h2 id="sources">依据与核验</h2>
          <p className={styles.help}>
            以下是公开的高校职业发展写作指南原文，用作写法依据；它们是建议，不是录用效果承诺。
            益职知识库里的简历改写规则与这两份指南交叉校验后整理成本页。
          </p>
          <div className={styles.sources}>
            <div>
              <strong>MIT CAPD 职业发展办公室</strong>
              <a
                href="https://capd.mit.edu/resources/career-toolkit-crafting-an-effective-resume/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Crafting an Effective Resume
                <ArrowRight size={14} aria-hidden="true" />
              </a>
              <p>
                MIT 职业发展处写的是：条目从动作写起，有结果就量化；没有确切数字时，写清角色和已经做成的事。
              </p>
            </div>
            <div>
              <strong>Harvard FAS Mignone Center for Career Success</strong>
              <a
                href="https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Guide to Creating a Strong Resume
                <ArrowRight size={14} aria-hidden="true" />
              </a>
              <p>Harvard 职业中心要求具体、真实、便于扫读，并检查转成 PDF 后的格式。它同时建议量化，不能用来证明「没有数字也可以」。</p>
            </div>
          </div>
          <p className={styles.help}>
            不编提升比例是益职自己的规则，不是这两所学校的结论。两处都不是录用承诺。核验日期 {REVIEWED_ON}。益职编辑整理。
          </p>
        </section>

        <PublicGuideFooter note="AI 也会犯错，请检查重要信息。本页不会读取或上传你的简历。" />
      </div>
    </main>
  );
}
