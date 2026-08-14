"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clipboard,
  Cloud,
  Copy,
  ExternalLink,
  HardDrive,
  LockKeyhole,
  Monitor,
  Sparkles,
} from "lucide-react";
import styles from "./Home.module.css";

const AGENT_PROMPT = "请打开并完整阅读 https://ai-job-coach.xin/agent 。按页面的 Agent 执行说明，在你当前的沙箱环境中安装益职免费版，验证本地求职作战盘可以打开。完成后只告诉我安装结果，并问我第一个应该提供的求职材料。";

export default function Home() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const legacyCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = AGENT_PROMPT;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const succeeded = document.execCommand("copy");
    textArea.remove();
    return succeeded;
  };

  const copyAgentPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await Promise.race([
          navigator.clipboard.writeText(AGENT_PROMPT),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 900)),
        ]);
      } else if (!legacyCopy()) {
        throw new Error("clipboard unavailable");
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2800);
    } catch {
      if (legacyCopy()) {
        setCopyState("copied");
        window.setTimeout(() => setCopyState("idle"), 2800);
      } else {
        setCopyState("error");
      }
    }
  };

  return (
    <main className={styles.page}>
      <span
        className={styles.contract}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: "<!-- THESIS: 同一套求职作战方法，用户先选择它运行在益职网页还是自己的 Agent；拒绝通用导师型 Hero。 OWN-WORLD: 暖白作战桌、行动橙、引导蓝、墨色 Agent 沙箱，细边界与连续网格。 STORY: 三秒看懂两种版本的费用、模型、数据和作战盘差异，然后选一条立即开始。 FIRST VIEWPORT: 左侧价值主张，右侧一张上下分层的运行方式选择器，两个主动作首屏可见。 FORM: 精确指定的双运行时路由表，seed yi-zhi-home-two-runtime-20260814。 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->" }}
      />

      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="益职 AI 首页">
          <Image src="/logo.png" alt="" width={42} height={42} priority />
          <span>益职</span>
        </Link>
        <nav className={styles.nav} aria-label="主导航">
          <a href="#compare">版本区别</a>
          <a href="#local-board">本地作战盘</a>
          <Link href="/agent">Agent 说明</Link>
        </nav>
        <Link className={styles.headerAction} href="/login?redirect=%2Fcockpit">
          登录网页版 <ArrowRight size={15} />
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Image className={styles.heroLogo} src="/logo.png" alt="益职 AI" width={82} height={82} priority />
          <h1>把求职变成一场有证据、可推进的作战。</h1>
          <p>
            益职把 JD、真实经历、一岗一版简历、面试练习和复盘放进同一个岗位机会。
            你只需决定：让它运行在益职网页，还是你自己的 Agent 里。
          </p>
          <div className={styles.heroProof}>
            <span><Check size={15} />不编造经历</span>
            <span><Check size={15} />阶段结果相互复用</span>
            <span><Check size={15} />每次只推进最重要的一步</span>
          </div>
        </div>

        <div className={styles.modeSelector} aria-label="选择益职使用方式">
          <section className={styles.webMode}>
            <div className={styles.modeIcon}><Cloud size={22} /></div>
            <div className={styles.modeBody}>
              <div className={styles.modeTitleLine}>
                <h2>网页端直接使用</h2>
                <span className={styles.paidTag}>付费</span>
              </div>
              <p>由益职提供模型、账号与托管作战盘。打开网页就能用，使用时消耗益职额度。</p>
              <div className={styles.modeFacts}>
                <span>益职模型</span><span>云端作战盘</span><span>跨设备</span>
              </div>
            </div>
            <Link className={styles.webAction} href="/login?redirect=%2Fcockpit">
              进入网页版 <ArrowRight size={16} />
            </Link>
          </section>

          <div className={styles.orDivider}><span>或</span></div>

          <section className={styles.agentMode}>
            <div className={styles.modeIcon}><HardDrive size={22} /></div>
            <div className={styles.modeBody}>
              <div className={styles.modeTitleLine}>
                <h2>在我的 Agent 中使用</h2>
                <span className={styles.freeTag}>益职免费</span>
              </div>
              <p>把下面这句话交给 Codex、WorkBuddy 或其他支持 MCP 的 Agent。模型在你的 Agent 中运行，作战盘建在它的本地沙箱。</p>
            </div>
            <div className={styles.promptBox}>
              <textarea aria-label="给 Agent 的安装指令" readOnly value={AGENT_PROMPT} />
              <button onClick={copyAgentPrompt} type="button">
                {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
                {copyState === "copied" ? "已复制" : "复制给我的 Agent"}
              </button>
              {copyState === "error" && <span className={styles.promptError} role="alert">复制受限，请在左侧指令中全选并复制。</span>}
            </div>
            <div className={styles.agentFoot}>
              <span><LockKeyhole size={14} />求职材料默认留在本机</span>
              <Link href="/agent">先看执行说明 <ExternalLink size={13} /></Link>
            </div>
          </section>
        </div>
      </section>

      <section className={styles.compareSection} id="compare">
        <div className={styles.sectionHeading}>
          <h2>区别只在它运行在哪里</h2>
          <p>两个版本使用同一套益职求职方法；模型、数据和作战盘所在地不同。</p>
        </div>
        <div className={styles.comparison} role="table" aria-label="网页版与 Agent 版对比">
          <div className={`${styles.compareRow} ${styles.compareHeader}`} role="row">
            <span role="columnheader">对比项</span>
            <strong role="columnheader">网页版</strong>
            <strong role="columnheader">Agent 版</strong>
          </div>
          {[
            ["模型由谁提供", "益职", "你的 Agent"],
            ["益职费用", "消耗益职额度", "益职免费"],
            ["作战盘在哪里", "益职云端", "Agent 本地沙箱"],
            ["材料默认在哪里", "按任务需要提交给益职", "留在当前 Agent 环境"],
            ["适合谁", "想打开网页就用", "已有常用 Agent，更在意本地与自由度"],
          ].map(([label, web, agent]) => (
            <div className={styles.compareRow} role="row" key={label}>
              <span role="cell">{label}</span>
              <span role="cell">{web}</span>
              <span role="cell">{agent}</span>
            </div>
          ))}
        </div>
        <p className={styles.costNote}>Agent 版的“益职免费”指益职不收取模型费；你使用的 Agent 仍按它自身套餐或额度计费。</p>
      </section>

      <section className={styles.localSection} id="local-board">
        <div className={styles.localCopy}>
          <h2>免费版不是一组提示词。<br />它会在你的 Agent 里建起作战盘。</h2>
          <p>安装完成后，Agent 会创建岗位机会、保存已完成产物，并返回一个只在本机可访问的作战盘链接。换一个对话，仍然可以继续同一个岗位。</p>
          <ol className={styles.localSteps}>
            <li><span>1</span><div><strong>复制一句话</strong><p>Agent 自己读取官网说明并识别当前宿主。</p></div></li>
            <li><span>2</span><div><strong>安装与验证</strong><p>加载益职方法和本地作战盘工具。</p></div></li>
            <li><span>3</span><div><strong>交给它一个真实岗位</strong><p>对话保留进度，复杂结果回到可视作战盘。</p></div></li>
          </ol>
          <button className={styles.copyLarge} onClick={copyAgentPrompt} type="button">
            <Clipboard size={17} />{copyState === "copied" ? "指令已复制" : "复制安装指令"}
          </button>
        </div>

        <div className={styles.boardDemo} aria-label="益职本地作战盘示意">
          <div className={styles.boardTopbar}>
            <span><Image src="/logo.png" alt="" width={28} height={28} />益职</span>
            <small><HardDrive size={13} />127.0.0.1 · 本地私密工作区</small>
          </div>
          <div className={styles.boardGrid}>
            <aside>
              <strong>岗位机会</strong>
              <div className={styles.boardActive}><small>示例科技</small><b>AI 产品经理</b><span>准备投递</span></div>
              <div><small>本地生活</small><b>策略产品</b><span>等待回复</span></div>
            </aside>
            <article>
              <small>示例科技 · AI 产品经理</small>
              <h3>先确认商业化结果，再决定是否投递。</h3>
              <div className={styles.evidenceLine}><span>强证据 4</span><span>弱证据 2</span><span>待确认 1</span></div>
              <div className={styles.artifactLine}><Sparkles size={15} /><span><strong>岗位决策卡</strong><small>已保存到本地产物</small></span></div>
              <div className={styles.artifactLine}><Monitor size={15} /><span><strong>岗位简历 V1</strong><small>2 处待你审阅</small></span></div>
            </article>
            <aside className={styles.boardNext}>
              <strong>下一步</strong>
              <small>今天</small>
              <b>补充一条可核实的结果指标</b>
              <p>这会直接改变投递判断。</p>
            </aside>
          </div>
          <p className={styles.demoCaption}>界面为功能示意，公司与内容均为演示数据。</p>
        </div>
      </section>

      <section className={styles.finalSection}>
        <h2>选好它运行在哪里，就从一个真实岗位开始。</h2>
        <div>
          <Link className={styles.finalWeb} href="/login?redirect=%2Fcockpit">使用付费网页版 <ArrowRight size={16} /></Link>
          <button className={styles.finalAgent} onClick={copyAgentPrompt} type="button"><Copy size={16} />{copyState === "copied" ? "已复制给 Agent" : "复制免费版指令"}</button>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 益职 AI</span>
        <div><Link href="/privacy">隐私说明</Link><Link href="/agent">Agent 执行说明</Link><a href="https://github.com/YE-YI7/ai-job-coach" target="_blank" rel="noreferrer">GitHub</a></div>
      </footer>
    </main>
  );
}
