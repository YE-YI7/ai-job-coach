"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ============================
   类型定义
   ============================ */
interface DetailedAnalysisItem {
  section: string;
  score: number;
  status: string;
  comment: string;
  fixes: string[];
}

interface ScoreResult {
  score: number;
  level: string;
  summary: string;
  topIssue: string;
  dimensions: Record<string, number>;
  suggestions: string[];
  detailedAnalysisCount: number;
  actionPlanCount: number;
  atsKeywordsCount: number;
  detailedAnalysis?: DetailedAnalysisItem[] | null;
  actionPlan?: string[] | null;
  atsKeywords?: string[] | null;
}

type UploadMode = 'idle' | 'dragging';
type ViewState = 'input' | 'loading' | 'result';

/* ============================
   常量
   ============================ */
const LEVEL_CONFIG: Record<string, { color: string; bg: string; border: string; emoji: string; label: string }> = {
  S: { color: 'text-amber-600', bg: 'from-amber-400 to-orange-500', border: 'border-amber-300', emoji: '🏆', label: '优秀' },
  A: { color: 'text-emerald-600', bg: 'from-emerald-400 to-green-500', border: 'border-emerald-300', emoji: '✨', label: '良好' },
  B: { color: 'text-blue-600', bg: 'from-blue-400 to-indigo-500', border: 'border-blue-300', emoji: '💪', label: '一般' },
  C: { color: 'text-violet-600', bg: 'from-violet-400 to-purple-500', border: 'border-violet-300', emoji: '📝', label: '待优化' },
  D: { color: 'text-red-600', bg: 'from-red-400 to-rose-500', border: 'border-red-300', emoji: '🔧', label: '需重写' },
};

const SOCIAL_PROOF_ITEMS = [
  { num: '12,847', label: '份简历已评分' },
  { num: '92%', label: '用户优化后提分' },
  { num: '5.2s', label: '平均出结果' },
];

/* ============================
   主页面
   ============================ */
export default function ResumeScorePage() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [viewState, setViewState] = useState<ViewState>('input');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');
  const [uploadMode, setUploadMode] = useState<UploadMode>('idle');
  const [showShareCard, setShowShareCard] = useState(false);
  const [submittedText, setSubmittedText] = useState('');
  const [reportUnlocked, setReportUnlocked] = useState(false);
  const [isUnlockingReport, setIsUnlockingReport] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(''), 2600);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  // ---------- 文件处理 ----------
  const processFile = useCallback(async (file: File) => {
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'txt') {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      return;
    }

    if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
      // 上传到 parse-resume API 解析
      setFileName(file.name);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/parse-resume', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (data.rawText) {
          setText(data.rawText);
        } else if (data.parsed) {
          // 将结构化数据转为文本
          const parts = [];
          if (data.parsed.summary) parts.push(data.parsed.summary);
          if (data.parsed.education?.length) {
            parts.push('教育背景：\n' + data.parsed.education.map((e: any) => 
              `${e.school} ${e.degree} ${e.time}\n${e.text}`
            ).join('\n'));
          }
          if (data.parsed.experiences?.length) {
            parts.push('工作经历：\n' + data.parsed.experiences.map((e: any) =>
              `${e.company} ${e.title} ${e.time}\n${e.text}`
            ).join('\n'));
          }
          if (data.parsed.projects?.length) {
            parts.push('项目经验：\n' + data.parsed.projects.map((p: any) =>
              `${p.title} ${p.role} ${p.start}-${p.end}\n${p.text}`
            ).join('\n'));
          }
          if (data.parsed.skills?.length) {
            parts.push('技能：' + data.parsed.skills.join('、'));
          }
          setText(parts.join('\n\n'));
        } else {
          setError(data.error || '文件解析失败，请尝试复制粘贴简历内容');
        }
      } catch {
        setError('文件解析失败，请尝试复制粘贴简历内容');
      }
      return;
    }

    setError('不支持的文件格式，请上传 PDF、Word 或 TXT 文件');
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ---------- 拖拽 ----------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setUploadMode('dragging');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setUploadMode('idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setUploadMode('idle');
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ---------- 评分 ----------
  const handleScore = async () => {
    setError('');
    const trimmedText = text.trim();

    if (trimmedText.length < 50) {
      setError('简历内容太短，请提供更完整的内容（至少50字）');
      return;
    }

    setSubmittedText(trimmedText);
    setReportUnlocked(false);
    setShareFeedback('');
    setViewState('loading');

    try {
      const res = await fetch('/api/resume/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmedText, mode: 'free' }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || '评分失败');
      }

      setResult(data);
      setViewState('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败，请稍后重试');
      setViewState('input');
    }
  };

  const handleUnlockFullReport = async () => {
    if (!submittedText) {
      throw new Error('请先完成一次简历扫描');
    }

    if (reportUnlocked) {
      setShareFeedback('完整报告已解锁');
      return;
    }

    setIsUnlockingReport(true);
    setError('');

    try {
      const res = await fetch('/api/resume/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: submittedText, mode: 'full' }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || '完整报告解锁失败');
      }

      setResult((prev) => ({
        score: data.score ?? prev?.score ?? 0,
        level: data.level ?? prev?.level ?? 'C',
        summary: data.summary ?? prev?.summary ?? '',
        topIssue: data.topIssue ?? prev?.topIssue ?? '',
        dimensions: data.dimensions ?? prev?.dimensions ?? {},
        suggestions: data.suggestions ?? prev?.suggestions ?? [],
        detailedAnalysisCount: data.detailedAnalysis?.length ?? prev?.detailedAnalysisCount ?? 0,
        actionPlanCount: data.actionPlan?.length ?? prev?.actionPlanCount ?? 0,
        atsKeywordsCount: data.atsKeywords?.length ?? prev?.atsKeywordsCount ?? 0,
        detailedAnalysis: data.detailedAnalysis ?? [],
        actionPlan: data.actionPlan ?? [],
        atsKeywords: data.atsKeywords ?? [],
      }));
      setReportUnlocked(true);
      setShareFeedback('分享成功，完整报告已解锁');
    } catch (err) {
      setError(err instanceof Error ? err.message : '完整报告解锁失败，请稍后重试');
      throw err;
    } finally {
      setIsUnlockingReport(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setText('');
    setFileName('');
    setSubmittedText('');
    setReportUnlocked(false);
    setShareFeedback('');
    setViewState('input');
    setError('');
  };

  const levelConfig = result ? (LEVEL_CONFIG[result.level] || LEVEL_CONFIG.C) : LEVEL_CONFIG.C;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: '益职AI简历健康度扫描',
    description: '免费上传简历 PDF、Word 或粘贴内容，快速获得 ATS 健康度评分、五维度诊断与优化建议。',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://ai-job-coach.xin/resume-score',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CNY',
    },
    provider: {
      '@type': 'Organization',
      name: '益职AI',
      url: 'https://ai-job-coach.xin',
    },
    featureList: ['ATS 简历评分', '五维度诊断', '简历优化建议', 'PDF/Word 上传解析'],
  };

  return (
    <>
      <style jsx global>{`
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
          background: #f8fafc;
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-float-delay { animation: float 3s ease-in-out infinite; animation-delay: 1s; }
        .animate-float-delay2 { animation: float 3s ease-in-out infinite; animation-delay: 2s; }
      `}</style>

      <div className="min-h-screen">
        {/* ===== Hero ===== */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 animate-gradient text-white">
          {/* 浮动装饰 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-[10%] w-20 h-20 bg-white/5 rounded-full blur-xl animate-float" />
            <div className="absolute top-32 right-[15%] w-32 h-32 bg-white/5 rounded-full blur-xl animate-float-delay" />
            <div className="absolute bottom-10 left-[30%] w-24 h-24 bg-white/5 rounded-full blur-xl animate-float-delay2" />
          </div>

          <div className="relative max-w-4xl mx-auto px-6 pt-12 pb-20 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6 border border-white/10">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              免费使用 · 无需注册 · 支持 PDF 上传
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight leading-tight">
              AI 简历健康度扫描
            </h1>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
              上传简历 PDF 或粘贴内容，5 秒获得 ATS 通过率评估 + 5 维度诊断
            </p>

            {/* 社会证明 */}
            <div className="flex items-center justify-center gap-8 md:gap-12">
              {SOCIAL_PROOF_ITEMS.map((item) => (
                <div key={item.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-extrabold text-white">{item.num}</div>
                  <div className="text-xs text-white/60 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 -mt-10 pb-20">
          <AnimatePresence mode="wait">
            {/* ===== 输入区 ===== */}
            {viewState === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
              >
                {/* 拖拽上传区 */}
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    mx-6 mt-6 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center
                    ${uploadMode === 'dragging'
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    {fileName ? (
                      <div>
                        <p className="text-sm font-medium text-slate-700">已选择: {fileName}</p>
                        <p className="text-xs text-slate-400 mt-1">点击重新选择文件</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          拖拽简历文件到这里，或 <span className="text-blue-600">点击上传</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">支持 PDF、Word、TXT 格式</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 分割线 */}
                <div className="flex items-center gap-4 mx-6 my-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 shrink-0">或者粘贴简历内容</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* 文本输入 */}
                <div className="px-6 pb-6">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={"将简历内容粘贴到这里...\n\n包含教育背景、工作/实习经历、项目经验、技能等，评分更准确"}
                    className="w-full h-48 p-4 border border-slate-200 rounded-xl text-sm text-slate-800 leading-relaxed resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50/50"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">
                      {text.length > 0 ? `${text.length} 字` : '最少 50 字'}
                    </span>
                    {text.length > 0 && (
                      <button onClick={() => { setText(''); setFileName(''); }} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                        清空
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleScore}
                    disabled={text.trim().length < 50}
                    className="w-full mt-4 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-base hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    立即扫描
                  </button>
                </div>
              </motion.div>
            )}

            {/* ===== 加载态 ===== */}
            {viewState === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl border border-slate-200 p-12 text-center"
              >
                <div className="w-16 h-16 mx-auto mb-6 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">AI 正在深度扫描</h3>
                <p className="text-sm text-slate-500">分析结构完整性 · 评估量化成果 · 检测 ATS 关键词...</p>
                <div className="flex justify-center gap-1.5 mt-6">
                  {['结构', '内容', '量化', '关键词', '排版'].map((dim, i) => (
                    <motion.div
                      key={dim}
                      className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-500"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.3 }}
                    >
                      {dim}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ===== 结果区 ===== */}
            {viewState === 'result' && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                {shareFeedback && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                    {shareFeedback}
                  </div>
                )}
                {/* Score Header Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
                  <div className="flex items-start gap-5 mb-6">
                    {/* 分数大卡片 */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                      className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${levelConfig.bg} flex flex-col items-center justify-center shadow-lg shrink-0`}
                    >
                      <span className="text-white/70 text-[10px] font-medium">ATS健康度</span>
                      <AnimatedScore targetScore={result.score} />
                      <span className="text-white/90 text-xs font-bold mt-0.5">
                        {levelConfig.emoji} {result.level}级 · {levelConfig.label}
                      </span>
                    </motion.div>
                    {/* 总结 */}
                    <motion.div
                      className="flex-1 min-w-0"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <h2 className="text-xl font-bold text-slate-800 mb-1.5">扫描完成</h2>
                      <p className="text-sm text-slate-600 leading-relaxed mb-3">{result.summary}</p>
                      {/* 最大减分项 badge */}
                      {result.topIssue && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                          <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="text-xs text-red-700 font-medium">{result.topIssue}</span>
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {/* 5 维度 */}
                  {result.dimensions && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {Object.entries(result.dimensions).map(([name, score], idx) => {
                        const beatPct = getBeatPercentage(name, score);
                        return (
                          <motion.div
                            key={name}
                            className="bg-slate-50 rounded-xl p-3 text-center"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 + idx * 0.12 }}
                          >
                            <div className="text-[10px] text-slate-500 mb-1 font-medium">{name}</div>
                            <motion.div
                              className="text-xl font-bold text-slate-800"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.8 + idx * 0.12 }}
                            >
                              {score}
                            </motion.div>
                            <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${
                                  score >= 80 ? 'bg-gradient-to-r from-emerald-400 to-green-500' :
                                  score >= 60 ? 'bg-gradient-to-r from-blue-400 to-indigo-500' :
                                  'bg-gradient-to-r from-red-400 to-orange-500'
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${score}%` }}
                                transition={{ delay: 0.9 + idx * 0.12, duration: 0.8, ease: "easeOut" }}
                              />
                            </div>
                            {beatPct > 0 && (
                              <motion.div
                                className="text-[9px] text-emerald-600 mt-1.5 font-medium"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.2 + idx * 0.12 }}
                              >
                                超越 {beatPct}% 用户
                              </motion.div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 免费建议（3条） */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.4 }}
                  className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8"
                >
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                    <span className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center text-sm">💡</span>
                    核心改进方向
                  </h3>
                  <div className="space-y-3">
                    {result.suggestions.map((s, i) => (
                      <motion.div
                        key={i}
                        className="flex items-start gap-3 p-3.5 bg-amber-50/70 rounded-xl border border-amber-100"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.6 + i * 0.1 }}
                      >
                        <span className="w-6 h-6 bg-amber-200/60 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* 🔒/✅ 完整报告区 */}
                {reportUnlocked ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.9 }}
                    className="space-y-5"
                  >
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                          <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-sm">📋</span>
                          逐模块深度分析
                        </h3>
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                          已完整解锁
                        </span>
                      </div>
                      <div className="space-y-3">
                        {(result.detailedAnalysis || []).map((item, index) => {
                          const statusMeta = getStatusMeta(item.status);
                          return (
                            <div key={`${item.section}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">{item.section}</div>
                                  <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${statusMeta.className}">
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClassName}`} />
                                    {statusMeta.label}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-2xl font-bold text-slate-800">{item.score}</div>
                                  <div className="text-[11px] text-slate-400">模块分</div>
                                </div>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{item.comment}</p>
                              {item.fixes?.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {item.fixes.map((fix, fixIndex) => (
                                    <div key={fixIndex} className="flex items-start gap-2 text-sm text-slate-700">
                                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                      <span>{fix}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                          <span className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center text-sm">🎯</span>
                          可执行修改方案
                        </h3>
                        <div className="space-y-3">
                          {(result.actionPlan || []).map((plan, index) => (
                            <div key={index} className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50/70 p-3.5">
                              <span className="w-6 h-6 bg-green-200/70 text-green-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                {index + 1}
                              </span>
                              <p className="text-sm text-slate-700 leading-relaxed">{plan}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                          <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-sm">🏷️</span>
                          ATS 关键词建议
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {(result.atsKeywords || []).map((keyword, index) => (
                            <span key={index} className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-sm text-blue-700 font-medium">
                              {keyword}
                            </span>
                          ))}
                        </div>
                        <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                          将这些关键词自然融入你的项目、技能和工作经历描述里，更有利于 ATS 初筛通过。
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.9 }}
                    className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent z-10 flex flex-col items-center justify-end pb-6 px-6 text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-800 mb-1">分享后立即解锁完整报告</p>
                      <p className="text-xs text-slate-500 mb-4 max-w-md">
                        包含 {result.detailedAnalysisCount} 项深度分析 + {result.actionPlanCount} 条可执行修改方案 + {result.atsKeywordsCount} 个 ATS 关键词建议
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                        <button
                          onClick={() => setShowShareCard(true)}
                          className="flex-1 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-sm hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
                        >
                          分享解锁完整报告
                        </button>
                        <a
                          href="/login?redirect=%2Fresume-score"
                          className="flex-1 px-5 py-3 bg-white text-slate-700 font-bold rounded-xl text-sm border border-slate-200 hover:bg-slate-50 transition-all"
                        >
                          注册后继续深度优化
                        </a>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400">先用分享拿到完整诊断，再进入站内继续修改和打磨</p>
                    </div>
                    <div className="opacity-40 blur-[2px] select-none pointer-events-none">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                        <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-sm">📋</span>
                        逐模块深度分析
                      </h3>
                      <div className="space-y-3">
                        {['工作经历', '教育背景', '项目经验', '技能描述'].map((section, i) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-slate-700">{section}</span>
                              <span className="text-xs px-2 py-0.5 bg-slate-200 rounded-full text-slate-500">待解锁</span>
                            </div>
                            <div className="h-3 bg-slate-200 rounded w-full mb-1.5" />
                            <div className="h-3 bg-slate-200 rounded w-4/5" />
                          </div>
                        ))}
                      </div>
                      <h3 className="font-bold text-slate-800 mt-6 mb-3 flex items-center gap-2 text-base">
                        <span className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center text-sm">🎯</span>
                        可执行修改方案
                      </h3>
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="p-3 bg-green-50 rounded-xl border border-green-100">
                            <div className="h-3 bg-green-200 rounded w-full mb-1" />
                            <div className="h-3 bg-green-200 rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 分享 + 重新评分 */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.2 }}
                  className="flex gap-3"
                >
                  <button
                    onClick={() => setShowShareCard(true)}
                    className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    分享我的分数
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    重新评分
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== Footer ===== */}
          <div className="py-12 text-center">
            <div className="flex items-center justify-center gap-8 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                数据安全
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI 驱动
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                5秒出结果
              </span>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              &copy; 2026 益职AI · 你的私人求职导师
            </p>
          </div>
        </div>
      </div>

      {/* ===== 分享卡片弹窗 ===== */}
      <AnimatePresence>
        {showShareCard && result && (
          <ShareCardModal
            result={result}
            isUnlocking={isUnlockingReport}
            onClose={() => setShowShareCard(false)}
            onUnlock={handleUnlockFullReport}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================
   分享卡片弹窗
   ============================ */
function ShareCardModal({
  result,
  onClose,
  onUnlock,
  isUnlocking = false,
}: {
  result: ScoreResult;
  onClose: () => void;
  onUnlock?: () => Promise<void>;
  isUnlocking?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const levelConfig = LEVEL_CONFIG[result.level] || LEVEL_CONFIG.C;

  const handleCopyLink = async () => {
    const shareText = `我的简历在益职AI获得了 ${result.score} 分（${result.level}级），快来测测你的简历有多少分？\n${window.location.origin}/resume-score`;

    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (onUnlock) {
      await onUnlock();
    }

    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 卡片内容 */}
        <div ref={cardRef} className={`bg-gradient-to-br ${levelConfig.bg} p-6 text-white text-center`}>
          <div className="text-sm font-medium text-white/70 mb-1">益职AI · 简历健康度扫描</div>
          <div className="text-6xl font-extrabold mb-1">{result.score}</div>
          <div className="text-lg font-bold mb-4">{levelConfig.emoji} {result.level}级 · {levelConfig.label}</div>
          <div className="flex justify-center gap-3 mb-4">
            {Object.entries(result.dimensions).slice(0, 3).map(([name, score]) => (
              <div key={name} className="bg-white/15 rounded-lg px-3 py-1.5 text-center">
                <div className="text-[10px] text-white/70">{name}</div>
                <div className="text-sm font-bold">{score}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-white/60">扫码或搜索「益职AI」测你的简历分</div>
        </div>
        {/* 操作区 */}
        <div className="p-4 space-y-2">
          <button
            onClick={handleCopyLink}
            disabled={isUnlocking}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isUnlocking ? '正在解锁完整报告...' : '复制文案并解锁完整报告'}
          </button>
          <button
            onClick={onClose}
            disabled={isUnlocking}
            className="w-full py-3 text-slate-500 font-medium text-sm hover:bg-slate-50 rounded-xl transition-all disabled:opacity-50"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================
   工具组件 & 函数
   ============================ */
function AnimatedScore({ targetScore }: { targetScore: number }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let current = 0;
    const duration = 1200;
    const steps = 30;
    const increment = targetScore / steps;
    const timer = setInterval(() => {
      current += increment;
      if (current >= targetScore) {
        setDisplayScore(targetScore);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [targetScore]);

  return (
    <span className="text-white text-4xl font-extrabold leading-none">{displayScore}</span>
  );
}

function getBeatPercentage(dimensionName: string, score: number): number {
  const avgScores: Record<string, number> = {
    "结构完整性": 62, "内容丰富度": 55, "量化成果": 42,
    "关键词匹配": 48, "排版规范": 65,
    "内容完整度": 58, "表达专业度": 52, "格式规范": 65,
    "项目经历": 50, "工作经历": 55, "教育背景": 62, "技能匹配": 45, "自我评价": 40,
  };
  const avg = avgScores[dimensionName];
  if (!avg || score <= avg) return 0;
  const zScore = (score - avg) / 15;
  return Math.max(0, Math.min(95, Math.round(50 + zScore * 20)));
}

function getStatusMeta(status: string) {
  const statusMap: Record<string, { label: string; className: string; dotClassName: string }> = {
    excellent: {
      label: '亮点模块',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClassName: 'bg-emerald-500',
    },
    good: {
      label: '表现稳定',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      dotClassName: 'bg-blue-500',
    },
    warning: {
      label: '建议重点优化',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      dotClassName: 'bg-amber-500',
    },
    critical: {
      label: '高优先级问题',
      className: 'border-red-200 bg-red-50 text-red-700',
      dotClassName: 'bg-red-500',
    },
  };

  return statusMap[status] || {
    label: '待进一步优化',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    dotClassName: 'bg-slate-400',
  };
}
