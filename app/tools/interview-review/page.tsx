import type { Metadata } from 'next';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import InterviewReviewTemplate from './InterviewReviewTemplate';
import PublicGuideNav from '@/components/public-guides/PublicGuideNav';
import PublicGuideFooter from '@/components/public-guides/PublicGuideFooter';
import {
  EXAMPLE_REVIEW,
  REVIEW_FIELDS,
  REVIEW_FIELD_LIMIT,
} from '@/lib/interview-review-template';
import { PUBLIC_SITE_URL } from '@/lib/public-discovery';
import styles from '@/components/public-guides/PublicGuide.module.css';

const PAGE_URL = `${PUBLIC_SITE_URL}/tools/interview-review`;

export const metadata: Metadata = {
  metadataBase: new URL(PAGE_URL),
  title: '面试复盘模板：四个问题，当天面完就能填（免登录，可复制下载）',
  description:
    '免登录的面试复盘空模板：面试官问了什么、我当时怎么答、哪里卡住及依据、下一次怎么答先练什么。可直接复制或下载纯文本 .txt，回答不上传、不进账号、不调用模型。',
  keywords: [
    '面试复盘 模板',
    '面试后 怎么复盘',
    '面试 回答 记录',
    '面试 卡壳 怎么记',
    '群面 复盘 问题',
    '面试复盘 该写什么',
    '益职AI',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: '面试复盘模板：四个问题，当天面完就能填',
    description: '免登录填写，复制或下载纯文本。回答只留在当前页面，不上传、不进账号、不调模型。',
    url: PAGE_URL,
    siteName: '益职AI',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '面试复盘模板：四个问题，当天面完就能填',
    description: '免登录填写，复制或下载纯文本带走。回答不上传、不保存到账号。',
  },
  robots: { index: true, follow: true },
};

export default function InterviewReviewPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <PublicGuideNav aside={{ href: '/guides/resume-without-metrics', label: '没有数字的简历怎么写' }} />

        <header className={styles.header}>
          <h1>面试复盘模板：四个问题，当天面完就能填</h1>
          <p className={styles.lead}>
            不用整理成文章，只回答四句：问了什么、当时怎么答、哪里卡住以及依据是什么、下一次怎么答要先练什么。
            填完复制或下载带走；这一页不保存你的回答。
          </p>
          <p className={styles.credit}>
            <span>益职编辑整理 · <time dateTime="2026-10-21">2026年10月21日</time></span>
            <span>免登录，无需邀请码</span>
            <span>每格最多 {REVIEW_FIELD_LIMIT} 字</span>
            <span>
              <ShieldCheck size={14} aria-hidden="true" />
              回答不上传、不进账号、不调用模型
            </span>
          </p>
        </header>

        <section className={styles.section} aria-labelledby="fill">
          <h2 id="fill">现在填</h2>
          <p className={styles.help}>
            刷新或离开本页会清空四格，请提前复制或下载。本页不会自动带入你账号里的简历或作答记录。
          </p>
          <InterviewReviewTemplate />
        </section>

        <section className={styles.section} aria-labelledby="blank">
          <h2 id="blank">空模板（不输入也能完整看）</h2>
          <dl className={styles.revision}>
            {REVIEW_FIELDS.map(({ key, question, hint }, index) => (
              <div key={key} className={styles.revisionRow}>
                <dt>{`${index + 1}. ${question}`}</dt>
                <dd className={styles.fact}>
                  {hint}
                  <br />
                  （空）
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="example">
          <h2 id="example">虚构示例（内容全部编造，不对应任何真实面试）</h2>
          <dl className={styles.revision}>
            {REVIEW_FIELDS.map(({ key, question }, index) => (
              <div key={key} className={styles.revisionRow}>
                <dt>{`${index + 1}. ${question}`}</dt>
                <dd className={styles.reason}>{EXAMPLE_REVIEW[key]}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.help}>
            示例里的人、公司、数字全是编的，只能说明这四格写到这个细度算合适，不能作为你的经历写进简历。
          </p>
        </section>

        <section className={styles.section} aria-labelledby="limits">
          <h2 id="limits">这一页能做什么、不能做什么</h2>
          <ul className={styles.boundaries}>
            <li>
              <strong>能：当场记下来，带走</strong>
              <p>四个问题按固定顺序复制或下载为 UTF-8 纯文本 .txt。文件里会加上标题和题号，每格去掉首尾空格，中间的换行保留。这不是 PDF。</p>
            </li>
            <li>
              <strong>不能：保存、生成、评分</strong>
              <p>不会替你写答案，不调用模型，不给评分、通过率或成功率，也不写进任何账号或云端。</p>
            </li>
            <li>
              <strong>不是 PDF</strong>
              <p>导出的是纯文本文件，不做排版。需要成稿排版请用简历工具，那是另一条链路。</p>
            </li>
            <li>
              <strong>示例只演示格式</strong>
              <p>填写自己的回答请先清空；编辑示例仍保留虚构来源标记，复制或下载时也会带上该标记。</p>
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="next">
          <h2 id="next">接着做哪一步</h2>
          <ul className={styles.nextLinks}>
            <li>
              <a href="/login?redirect=%2Fcockpit">
                继续和导师练习
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>登录后需要你重新提供材料：这一页填的四格不会自动上传，也不会调用模型或写入接口。</span>
            </li>
            <li>
              <a href="/guides/resume-without-metrics">
                简历里没有业绩数字怎么写
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>对象、动作、产物三步写法，附一条虚构经历的改写示例。</span>
            </li>
            <li>
              <a href="/tools/resume-jd-gap">
                对照 JD 逐条找缺口
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <span>贴进简历和 JD，本地即时对照关键词与硬门槛。</span>
            </li>
          </ul>
        </section>

        <PublicGuideFooter note="这一页不记录你的回答，也不写入任何账号。离开前请复制或下载。" />
      </div>
    </main>
  );
}
