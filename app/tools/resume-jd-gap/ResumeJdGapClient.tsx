"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileText, ShieldCheck } from 'lucide-react';
import { analyzeResumeGap, MAX_TEXT_LENGTH } from '@/lib/resume-gap/matcher';
import { buildGapChecklist, GAP_EXAMPLES, GAP_FAQS, gapEventProperties, isGapExample, validateGapInput } from '@/lib/resume-gap/workflow';
import { trackProductEvent } from '@/lib/product-events';
import styles from './ResumeJdGap.module.css';

export default function ResumeJdGapClient() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState<string>(GAP_EXAMPLES.engineering.resumeText);
  const [jdText, setJdText] = useState<string>(GAP_EXAMPLES.engineering.jdText);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [backup, setBackup] = useState<{ resumeText: string; jdText: string } | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const resumeRef = useRef<HTMLTextAreaElement | null>(null);
  const jdRef = useRef<HTMLTextAreaElement | null>(null);
  const viewed = useRef(false);
  const inputError = validateGapInput(resumeText, jdText);
  const sample = isGapExample(resumeText, jdText);
  const report = useMemo(() => inputError ? null : analyzeResumeGap({ resumeText, jdText }), [resumeText, jdText, inputError]);

  useEffect(() => {
    let alive = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { authenticated?: boolean }) => { if (alive) setAuthenticated(Boolean(d?.authenticated)); })
      .catch(() => { if (alive) setAuthenticated(false); });
    if (!viewed.current) { viewed.current = true; trackProductEvent('resume_gap_viewed', { sample: true }); }
    return () => { alive = false; };
  }, []);

  const runNow = () => {
    if (!report) {
      setNotice(inputError || '请检查材料。');
      (!resumeText.trim() || resumeText.length > MAX_TEXT_LENGTH ? resumeRef : jdRef).current?.focus();
      return;
    }
    trackProductEvent(sample ? 'resume_gap_sample_used' : 'resume_gap_used', gapEventProperties(report, sample));
    setNotice(sample ? '这是示例结果。换成你的材料后，对照会即时更新。' : '已按当前材料更新对照。');
    resultsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  const replaceMaterials = (next: { resumeText: string; jdText: string }) => {
    setBackup({ resumeText, jdText }); setResumeText(next.resumeText); setJdText(next.jdText);
    setNotice('材料已替换，可以撤销。');
    if (!next.resumeText) resumeRef.current?.focus();
  };
  const exportChecklist = async (method: 'copy' | 'download') => {
    if (!report) return;
    try {
      const text = buildGapChecklist(report, sample);
      if (method === 'copy') {
        await navigator.clipboard.writeText(text); setNotice('清单已复制，可以带到你常用的笔记或 AI 工具。');
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `益职-简历对照清单${sample ? '-示例' : ''}.txt`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('清单已生成，包含你材料中的相关摘录，请妥善保存。');
      }
      trackProductEvent(method === 'copy' ? 'resume_gap_checklist_copied' : 'resume_gap_checklist_downloaded', gapEventProperties(report, sample));
    } catch { setNotice(method === 'copy' ? '浏览器未允许复制，请改用下载清单。' : '下载未成功，请改用复制清单。'); }
  };
  const goCockpit = () => {
    if (authenticated !== true) {
      trackProductEvent('resume_gap_signup', report ? gapEventProperties(report, sample) : { sample });
      router.push('/login?redirect=%2Ftools%2Fresume-jd-gap');
    } else router.push('/cockpit');
  };

  return (
    <main className={styles.page}><div className={styles.container}>
      <nav className={styles.navigation} aria-label="工具导航"><Link href="/"><ArrowLeft size={17} />益职 AI</Link><Link href="/tools/offer-compare">比较 Offer<ArrowRight size={16} /></Link></nav>
      <header className={styles.header}><div><h1>把简历和岗位<br />对一遍。</h1><p>先看哪里缺证据，再决定怎么改。</p></div><p className={styles.privacy}><ShieldCheck size={19} />免登录 · 本地对照 · 不消耗模型额度<br /><span>文字不上传，关闭页面不留存。</span></p></header>
      <section aria-label="对照材料" className={styles.materials}>
        <div className={styles.materialToolbar}><h2>{sample ? '先试试示例' : '你的对照材料'}</h2><div className={styles.exampleActions}>
          {Object.entries(GAP_EXAMPLES).map(([key, example]) => <button key={key} type="button" aria-pressed={resumeText === example.resumeText && jdText === example.jdText} onClick={() => replaceMaterials(example)}>{example.label}示例</button>)}
          <button type="button" onClick={() => replaceMaterials({ resumeText: '', jdText: '' })}>换成我的材料</button>
          {backup && <button type="button" onClick={() => { setResumeText(backup.resumeText); setJdText(backup.jdText); setBackup(null); setNotice('已恢复上一次材料。'); }}>撤销</button>}
        </div></div>
        <div className={styles.editors}>
          <label className={styles.editor}><span><FileText size={18} />我的简历<small>{resumeText.length.toLocaleString('zh-CN')} 字符</small></span><textarea ref={resumeRef} value={resumeText} rows={8} placeholder="粘贴经历、项目、技能和教育背景…" aria-describedby="gap-input-help" aria-invalid={resumeText.length > MAX_TEXT_LENGTH} onChange={(e) => { setResumeText(e.target.value); setNotice(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runNow(); } }} /></label>
          <label className={styles.editor}><span><FileText size={18} />目标岗位 JD<small>{jdText.length.toLocaleString('zh-CN')} 字符</small></span><textarea ref={jdRef} value={jdText} rows={8} placeholder="粘贴岗位职责与任职要求…" aria-describedby="gap-input-help" aria-invalid={jdText.length > MAX_TEXT_LENGTH} onChange={(e) => { setJdText(e.target.value); setNotice(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runNow(); } }} /></label>
        </div>
        <div className={styles.runBar}><button type="button" className={styles.primary} onClick={runNow}>查看对照<ArrowRight size={18} /></button><p id="gap-input-help">即时更新 · 每份最多 20,000 字符<span className={styles.shortcut}>⌘ / Ctrl + Enter</span></p></div>
        {inputError && <p className={styles.inputError} role="alert">{inputError}</p>}
      </section>
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
      <section ref={resultsRef} className={styles.results} aria-label="对照结果">
        {!report ? <div className={styles.empty}><FileText size={28} /><h2>{resumeText.trim() && jdText.trim() ? '材料需要调整' : '贴好两份材料，就能开始'}</h2><p>你的输入仍在上方，没有丢失或截断。</p></div> : <>
          <div className={styles.resultHeader}><div><h2>{sample ? '示例对照' : '这份简历，先改哪里？'}</h2><p>词面初筛，不是能力评分或真实 ATS 判定。</p></div><div className={styles.exportActions}><button type="button" onClick={() => void exportChecklist('copy')}><Copy size={17} />复制清单</button><button type="button" onClick={() => void exportChecklist('download')}><Download size={17} />下载清单</button></div></div>
          <div className={styles.resultLayout}>
            <aside className={styles.nextSteps} aria-label="修改顺序"><h3>按这个顺序补</h3><ol>
              <li><a href="#gap-gates">先核实硬门槛<ArrowRight size={16} /></a><p>{report.summary.hardUnmet ? `${report.summary.hardUnmet} 条还没找到充分证据，先核对原文。` : '没有发现待补证据的门槛，仍请核对完整 JD。'}</p></li>
              <li><a href="#gap-terms">再补真实经历<ArrowRight size={16} /></a><p>做过的补对应经历；没做过的，不写成已有能力。</p></li>
              <li><a href="#gap-results">最后补结果<ArrowRight size={16} /></a><p>补个人动作、结果或对比基准；数字必须可核实。</p></li>
            </ol><button type="button" onClick={goCockpit} className={styles.mentorButton}>让导师带我逐条改<ArrowRight size={17} /></button><p className={styles.handoff}>需登录及模型额度。此页材料不会自动上传；请先下载清单，进入辅导后再提供材料。</p></aside>
            <div className={styles.evidence}>
              <section id="gap-gates"><h3>硬门槛<span>{report.summary.hardUnmet} 条待核实</span></h3><p className={styles.help}>没找到证据 ≠ 不满足。对照 JD 原文确认。</p>{report.hardRequirements.length ? <ul className={styles.gates}>{report.hardRequirements.map((h) => <li key={h.label}><div><strong>{h.label}</strong><span className={h.satisfied ? styles.confirmed : styles.unconfirmed}>{h.satisfied && <Check size={14} />}{h.satisfied ? '词面有证据' : '待核实'}</span></div>{h.jdEvidence && <p>JD：{h.jdEvidence}</p>}</li>)}</ul> : <p>未抽到明确硬门槛，请自行核对完整 JD。</p>}</section>
              <section id="gap-terms"><h3>关键词缺口<span>{report.summary.missingCount} 个未命中</span></h3>{report.summary.jdKeywordCount === 0 ? <p>未抽到可对照的关键词。请补充任职要求；当前词典不覆盖所有职业。</p> : <><p className={styles.help}>词面未命中不等于能力不足。先核对真实经历。</p><ul className={styles.terms}>{report.missing.map((term) => <li key={term}>{term}</li>)}</ul>{!report.missing.length && <p>抽到的关键词都有词面命中，仍需检查经历是否充分。</p>}<details className={styles.matched}><summary>查看已命中的 {report.summary.matchedCount} 个关键词</summary><p>{report.matched.filter((m) => m.inResume).map((m) => m.term).join('、') || '暂无命中'}</p></details></>}</section>
              <section id="gap-results"><h3>结果证据<span>{report.weakQuantification.length} 条建议检查</span></h3><p className={styles.help}>无需每条都写数字；范围、频次和可核验的结果也能作为证据。</p>{report.weakQuantification.length ? <ul className={styles.weakLines}>{report.weakQuantification.map((line) => <li key={line}>{line}{line.length >= 60 ? '…' : ''}</li>)}</ul> : <p>未发现明显缺量化描述的条目，这不代表简历已完整。</p>}</section>
            </div>
          </div>
        </>}
      </section>
      <section className={styles.faq} aria-label="常见问题"><h2>你可能想问</h2>{GAP_FAQS.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
      <footer className={styles.footer}>AI 也会犯错，请检查重要信息。<Link href="/">回到益职 AI<ArrowRight size={16} /></Link></footer>
    </div></main>
  );
}
