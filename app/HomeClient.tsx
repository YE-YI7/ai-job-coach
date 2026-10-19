"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, CheckCircle, Copy, User } from "@phosphor-icons/react";
import ResumePaper from "@/components/resume/ResumePaper";
import { DEMO_AFTER, DEMO_BEFORE, LANDING_RESUME } from "@/lib/landing-demo";
import { renderResumePrintWindow } from "@/lib/resume-print";
import { trackProductEvent } from "@/lib/product-events";
import { PUBLIC_SITE_URL } from "@/lib/public-discovery";
import styles from "./Home.module.css";

const START = "/login?redirect=%2Fcockpit";
const AGENT_PROMPT = `请打开并完整阅读 ${PUBLIC_SITE_URL}/agent 。按页面的 Agent 执行说明，在你当前的沙箱环境中安装益职免费版，验证本地求职作战盘可以打开。完成后只告诉我安装结果，并问我第一个应该提供的求职材料。`;

export default function HomeClient() {
  const viewed = useRef(false);
  const [view, setView] = useState<"original" | "suggestion">("suggestion");
  const [adopted, setAdopted] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [answer, setAnswer] = useState("");
  const [showPractice, setShowPractice] = useState(false);
  const [practiceSaved, setPracticeSaved] = useState(false);
  const currentText = adopted ? LANDING_RESUME.replace(DEMO_BEFORE, DEMO_AFTER) : LANDING_RESUME;
  const displayedResume = view === "original" ? LANDING_RESUME : currentText;

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      trackProductEvent("landing_viewed", { surface: "home" });
    }
  }, []);

  function previewPdf() {
    setPreviewError("");
    const preview = window.open("about:blank", "_blank");
    if (!preview) { setPreviewError("浏览器拦截了预览，请允许打开新窗口后重试。"); return; }
    preview.opener = null;
    renderResumePrintWindow(preview, displayedResume, "modern", "益职 · 虚构示例简历");
  }

  async function copyAgentPrompt() {
    try { await navigator.clipboard.writeText(AGENT_PROMPT); setCopyState("copied"); }
    catch { setCopyState("error"); }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="益职 AI 首页"><Image src="/logo.png" alt="" width={38} height={38} priority /><span>益职</span></Link>
      <nav className={styles.nav} aria-label="主导航"><a href="#resume-demo">简历修改</a><a href="#interview-demo">模拟面试</a><a href="#questions">常见问题</a></nav>
      <div className={styles.headerActions}><Link href={START}>登录</Link><Link className={styles.headerStart} href={START}>开始使用</Link></div>
    </header>

    <section className={styles.hero} aria-labelledby="home-heading">
      <h1 id="home-heading">你的 AI 求职导师</h1>
      <p>从改好一份简历，到答好下一场面试。<br />记得你的经历，也保留每一步进展。</p>
      <div className={styles.heroActions}><Link className={styles.primary} href={START}>开始使用益职 <ArrowRight size={18} /></Link><a className={styles.quietLink} href="#resume-demo">看看它怎么帮你</a></div>
      <span className={styles.heroNote}>没有目标岗位，也能先改简历</span>
    </section>

    <section className={styles.demoSection} id="resume-demo" aria-label="简历修改互动演示">
      <div className={styles.demoWorkbench}>
        <div className={styles.demoToolbar}>
          <span className={styles.demoBrand}><Image src="/logo.png" alt="" width={28} height={28} />益职</span>
          <div className={styles.demoControls} role="group" aria-label="示例简历视图">
            <button type="button" aria-pressed={view === "original"} onClick={() => setView("original")}>查看原件</button>
            <button type="button" aria-pressed={view === "suggestion"} onClick={() => setView("suggestion")}>修改建议</button>
            <button type="button" className={styles.pdfAction} onClick={previewPdf}>预览示例 PDF</button>
          </div>
        </div>
        <div className={styles.demoGrid}>
          <div className={styles.documentColumn}><ResumePaper text={displayedResume} template="modern" title={view === "original" ? "虚构示例原简历" : "虚构示例简历，与产品成稿共用排版"} showZoom controlsBelow highlight={view === "suggestion" ? adopted ? DEMO_AFTER : DEMO_BEFORE : undefined} /></div>
          <aside className={styles.demoMentor} aria-label="示例修改建议">
            <div>
              <h2>{view === "original" ? "原来的样子，好好保留。" : "这段经历，该怎么写得更具体？"}</h2>
              <div className={styles.mentorLine}><Image src="/logo.png" alt="导师" width={36} height={36} /><p>{view === "original" ? "上传的原件不重排；修改另存为成稿，由你确认。" : "先写清你负责了什么，再补能核实的结果。"}</p></div>
              {view === "suggestion" && <div className={styles.suggestion}>
                <h3>修改建议</h3><p className={styles.revisedSentence}>{DEMO_AFTER}</p>
                <p>这句话具体说明了你的工作内容、方法和推进动作，比「负责客服相关产品工作」更清晰。</p>
                <div className={styles.suggestionDetails}><h4>可以补充（如有）</h4><ul><li>覆盖的客服场景或问题类型</li><li>上线后的实际效果</li></ul><span>没有确认的数字，不替你添加。</span></div>
                <button type="button" className={styles.adoptAction} onClick={() => setAdopted(value => !value)}>{adopted ? "撤回示例修改" : "试试采用这条修改"}<ArrowRight size={16} /></button>
              </div>}
            </div>
            <p className={styles.demoStatus} role="status"><CheckCircle size={18} weight="fill" />{view === "original" ? "示例原件未改动" : adopted ? "演示：纸面高亮处已更新，可定位查看" : "纸面高亮的是原句，由你决定是否修改"}</p>
          </aside>
        </div>
      </div>
      <p className={styles.caption}>产品演示 · 虚构资料，不读取或保存你的简历</p>
      {previewError && <p className={styles.error} role="alert">{previewError}</p>}
    </section>

    <section className={styles.interviewSection} id="interview-demo" aria-labelledby="interview-heading">
      <div className={styles.interviewCopy}><h2 id="interview-heading">不会答，<br />就从讲明白开始。</h2><p>一次一题，先理解，再用自己的话重新作答。</p><button className={styles.textAction} type="button" onClick={() => { setShowPractice(true); setPracticeSaved(false); }}>看看面试怎么练 <ArrowRight size={18} /></button></div>
      <div className={styles.interviewConversation} aria-label="面试带练演示">
        <span className={styles.demoLabel}>带练演示</span>
        <p className={styles.interviewQuestion}>你如何判断一个需求值不值得做？</p>
        <div className={styles.userLine}><User size={28} /><p>我不会。</p></div>
        <div className={styles.coachLine}><Image src="/logo.png" alt="导师" width={36} height={36} /><p>先看谁遇到问题、发生多频繁、解决后有什么变化。<br />先从一个你做过的需求说起。</p></div>
        {showPractice ? <form onSubmit={event => { event.preventDefault(); if (answer.trim()) setPracticeSaved(true); }} className={styles.practiceForm}>
          <label htmlFor="demo-answer">试着说一个你做过的需求</label><div><textarea id="demo-answer" value={answer} onChange={event => { setAnswer(event.target.value); setPracticeSaved(false); }} placeholder="谁遇到了什么问题？你做了什么？" rows={2} maxLength={1000} /><button type="submit" aria-label="完成这次演示回答" disabled={!answer.trim()}><ArrowUp size={20} /></button></div>
          <p role="status">{practiceSaved ? "演示完成。进入工作区后，导师会针对你的回答继续辅导。" : "仅在当前页面体验，不发送给 AI，不扣额度。"}</p>
        </form> : <button type="button" className={styles.practiceInvite} onClick={() => setShowPractice(true)}><span>试着重新回答…</span><ArrowUp size={20} /></button>}
      </div>
    </section>

    <div className={styles.midAction}><Link className={styles.primary} href={START}>开始你的第一次辅导 <ArrowRight size={18} /></Link></div>

    <section className={styles.questions} id="questions" aria-labelledby="questions-heading"><h2 id="questions-heading">你可能还想知道</h2><div>
      <details><summary>还没有目标岗位，也能改简历吗？</summary><p>可以。先上传简历，把已有经历写清楚；有了目标岗位后，再做针对性调整。</p></details>
      <details><summary>会不会改坏我原来的简历？</summary><p>上传文件的原件保持原样。修改建议单独展示，由你确认采用，再预览新成稿和导出 PDF。更新基础简历前会提示覆盖确认。</p></details>
      <details><summary>哪些操作会消耗额度？</summary><p>这页的示例和免费工具不消耗模型额度。工作区内的 AI 修改、分析和辅导会按界面提示计费；连接 TokenPay 后按模型用量计费。保存回答与笔记免费。</p></details>
      <details id="try-tools"><summary>想先不用登录试一试？</summary><p>可以先用<Link href="/tools/resume-jd-gap" onClick={() => trackProductEvent("landing_task_clicked", { task: "resume_gap", placement: "tools" })}>简历与岗位对照</Link>，或<Link href="/tools/offer-compare" onClick={() => trackProductEvent("landing_task_clicked", { task: "offer_compare", placement: "tools" })}>比较两份 Offer</Link>。前者是本地文字初筛，不等于完整的 AI 简历修改。</p></details>
      <details id="compare"><summary>网页版和 Agent 版有什么区别？</summary><p>网页版直接使用益职提供的模型和云端工作区，AI 操作消耗额度。Agent 版使用你已有的 Agent 模型和本地沙箱，益职不另收模型费，但宿主模型仍按自身套餐计费；两个版本的资料默认不互相同步。</p><Link href="/agent">查看完整 Agent 使用说明 <ArrowRight size={15} /></Link>
        <div id="local-board" className={styles.agentInstall}><label htmlFor="agent-prompt">把这句话交给你的 Agent</label><textarea id="agent-prompt" readOnly value={AGENT_PROMPT} rows={4} /><button type="button" onClick={() => void copyAgentPrompt()}><Copy size={16} />{copyState === "copied" ? "已复制" : "复制安装指令"}</button>{copyState === "error" && <p role="alert">复制受限，请在上方指令中全选并复制。</p>}</div>
      </details>
    </div></section>

    <footer className={styles.footer}><Link className={styles.brand} href="/"><Image src="/logo.png" alt="" width={30} height={30} /><span>益职</span></Link><p>简历、面试和下一步，都能接着做。</p><nav aria-label="页脚导航"><a href="#try-tools">免费工具</a><Link href="/agent">Agent 说明</Link><Link href="/privacy">隐私说明</Link><a href="https://github.com/YE-YI7/ai-job-coach" target="_blank" rel="noopener noreferrer">GitHub</a></nav><small>© 2026 益职 AI</small></footer>
  </main>;
}
