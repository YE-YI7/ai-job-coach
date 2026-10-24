import Link from "next/link";
import Image from 'next/image';
import styles from "./HomeLanding.module.css";
import EntryTrackLink from "@/components/EntryTrackLink";
import { ENTRY_DOORS, entryHref } from "@/lib/entry-doors";

export const HOME_FAQS = [
  { q: "益职和简历工具有什么区别？", a: "简历工具先让你改简历；益职先把岗位拆成判断、证据缺口和今天该做的一步，简历与面试准备都围绕这个岗位，不从零解释自己。" },
  { q: "和通用聊天工具有什么不同？", a: "益职围绕求职保留材料、已确认事实、简历版本和当前安排，方便下一次接着做。没有确认的职责、数字和成果不会作为你的真实经历。" },
  { q: "没有 JD 也能开始吗？", a: "可以。只有简历时先把简历存进工作区，再一起判断方向；还没方向时先说一句困惑，导师一次只问一个最影响选择的问题。没有 JD 不会生成没有依据的匹配分。" },
  { q: "会保存我的简历吗？", a: "免登录工具在本地完成对照，不上传文字；登录后保存到你的工作区，可随时删除。Agent 版默认只写本地目录。" },
  { q: "Agent 版是什么？收费吗？", a: "用你自己的 Codex、Claude Code 等 Agent 提供模型，益职提供方法与本地作战盘，不额外收模型费用；实际费用取决于你使用的 Agent 平台。" },
  { q: "网页体验是免费修改整份简历吗？", a: "不是。首次账号体验限一段工作、实习或项目经历，不是整份简历免费重写；后续 AI 操作按页面提示使用额度，保存材料和手动编辑不等于调用模型。" },
] as const;

export default function HomeLanding() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="益职 AI 首页">
            <Image src="/logo.png" alt="" width={33} height={33}/>益职
          </Link>
          <nav className={styles.nav} aria-label="主导航">
            <Link href="/agent">Agent 版</Link>
            <Link href="/tools/resume-jd-gap">免登录工具</Link>
            <a href="#how">怎么用</a>
            <Link className={styles.topCta} href="/login?redirect=%2Fcockpit">开始使用</Link>
          </nav>
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="home-heading">
            <h1 id="home-heading"><span className={styles.line}><span>从一个确定开始，</span></span><span className={styles.line}><span>把其他不确定<em>练到确定</em>。</span></span></h1>
            <p className={styles.subEn}>Start with one certainty. Train the rest.</p>
            <p className={styles.lead}>一份简历、一个岗位，或只有一句困惑，都能开始。<b>选一个起点，我们一起找到下一步。</b></p>
            <div className={styles.index} aria-label="工作流">
              <span>岗位判断</span><i aria-hidden="true" /><span>简历证据</span><i aria-hidden="true" /><span>面试准备</span><i aria-hidden="true" /><span>面后复盘</span>
            </div>

            <div className={styles.doors}>
              {ENTRY_DOORS.map((door) => (
                <EntryTrackLink className={styles.door} href={entryHref(door.kind)} kind={door.kind} key={door.kind}>
                  <div className={styles.meta}><span>{door.index}</span><span>{door.meta}</span></div>
                  <h2>{door.title}</h2>
                  <p>{door.desc}</p>
                  <div className={styles.out}>产出：<b>{door.out}</b></div>
                  <div className={styles.go}>{door.cta} <span aria-hidden="true">→</span></div>
                </EntryTrackLink>
              ))}
            </div>

            <div className={styles.preview} aria-label="产出示例">
              <div className={styles.chrome}><span className={styles.dots}><i /><i /><i /></span><span className={styles.windowTitle}>益职 · 岗位作战盘</span><span className={styles.tag}>示例 · 虚构</span></div>
              <div className={styles.tabs}><span className={styles.on}>判断</span><span>证据</span><span>下一步</span></div>
              <div className={styles.previewBody}>
                <div className={styles.verdict}><span className={styles.pill}>值得投 · 先补 2 条</span><span className={styles.notScore}>NOT A SCORE</span></div>
                <h3>先补 2 条证据，再投这个岗位。</h3>
                <div className={styles.evidence}>
                  <div><span className={styles.ok}>✓</span><p><b>需求判断</b>：做过客服问题分流，能讲清判断依据。</p><span>证据 01</span></div>
                  <div><span className={styles.warn}>△</span><p><b>上线指标</b>：只有「上线」，没有「指标动了」。</p><span>缺口 01</span></div>
                  <div><span className={styles.warn}>△</span><p><b>AI 产品</b>：简历里没有可直接核实的经历。</p><span>缺口 02</span></div>
                </div>
                <div className={styles.next}><div><span>TODAY · 1 ACTION</span><b>补一条上线指标，再改简历那一段</b></div><span className={styles.nextBtn}>打开作战盘 →</span></div>
              </div>
            </div>
            <div className={styles.heroFoot}><span>没有 JD 也能先存简历、找方向或直接说困惑，不生成没有依据的匹配分。</span><span>免登录工具在本地完成对照、文字不上传；登录后材料进入你的工作区 · 不承诺 offer</span></div>
            <p className={styles.fit}><Link href="/demo">试试简历改稿、PDF 和面试演示 →</Link></p>
          </section>

          <section className={styles.section} id="what" aria-labelledby="what-heading">
            <h2 id="what-heading">益职 AI 是什么</h2>
            <div className={styles.prose}>
              <p><b>益职 AI 是一个以岗位为主线的 AI 求职作战盘。</b>它把岗位 JD、简历和面试记录整理成可执行的岗位判断、证据库和下一步动作；简历与面试准备都围绕同一个岗位，而不是从零开始聊天。</p>
              <p>两种用法：网页版由益职提供模型与云端工作区；Agent 版用你自己的 Codex、Claude Code 等 Agent 提供模型，益职提供方法与本地作战盘。关键事实需要你确认，未确认的内容不会写进产物。</p>
            </div>
            <div className={styles.compare}>
              <div><span className={styles.compareLabel}>简历工具</span><p>先改文档，默认你已经决定要投；换一个岗位再从头改一遍。</p></div>
              <div><span className={styles.compareLabel}>通用聊天</span><p>适合开放式讨论；求职材料、版本与后续动作通常需要自己整理。</p></div>
              <div><span className={styles.compareLabel}>益职</span><p>先判断岗位值不值得投，再补证据、改简历、准备面试；一个岗位一版，判断和证据可复用。</p></div>
            </div>
          </section>

          <section className={styles.section} id="how" aria-labelledby="how-heading">
            <h2 id="how-heading">怎么用</h2>
            <ol className={styles.steps}>
              <li><span>01</span><b>收岗位</b><p>把 JD 和目标一起放进来，先建一个岗位作战盘。</p></li>
              <li><span>02</span><b>判价值</b><p>看匹配、证据缺口和推进成本，再决定投不投。</p></li>
              <li><span>03</span><b>补证据</b><p>只补会被追问的那几条，不编造经历。</p></li>
              <li><span>04</span><b>推下一步</b><p>简历、面试、复盘围绕同一个岗位推进。</p></li>
            </ol>
            <p className={styles.fit}><b>适合谁：</b>正在跟进多个岗位、需要判断优先级和准备材料的求职者，尤其是 AI 产品、数据、运营方向的校招与转行人群。</p>
          </section>

          <section className={styles.section} id="faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading">常见问题</h2>
            <div className={styles.faq}>
              {HOME_FAQS.map((item) => (<details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>))}
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <span>© 2026 益职 AI</span>
          <span className={styles.footerLinks}><Link href="/demo#local-board">复制 Agent 安装指令</Link><Link href="/agent">Agent 版</Link><Link href="/guides/resume-without-metrics">没有量化成果怎么写</Link><Link href="/tools/interview-review">面试复盘模板</Link><Link href="/tools/resume-jd-gap">简历 × JD</Link><Link href="/tools/offer-compare">Offer 对比</Link><Link href="/privacy">隐私</Link></span>
        </footer>
      </div>
    </div>
  );
}
