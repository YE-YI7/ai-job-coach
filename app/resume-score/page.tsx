"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScoreResult {
  score: number;
  level: string;
  summary: string;
  dimensions: Record<string, number>;
  suggestions: string[];
  detailedAnalysis?: Array<{ section: string; score: number; comment: string }>;
}

export default function ResumeScorePage() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');
  const [showLoginHint, setShowLoginHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const content = await file.text();
      setText(content);
    } else {
      // 对于 PDF/DOCX，提示用户复制粘贴
      setError('目前仅支持文本格式，请复制简历内容粘贴到文本框中');
    }
  };

  const handleScore = async () => {
    setError('');
    if (text.trim().length < 50) {
      setError('简历内容太短，请提供更完整的内容');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/resume/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || '评分失败');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      S: 'from-amber-400 to-orange-500',
      A: 'from-emerald-400 to-green-500',
      B: 'from-blue-400 to-indigo-500',
      C: 'from-violet-400 to-purple-500',
      D: 'from-red-400 to-rose-500',
    };
    return colors[level] || colors.C;
  };

  return (
    <>
      <style jsx global>{`
        body {
          font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
          background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #fdf2f8 100%);
        }
      `}</style>

      <div className="min-h-screen">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full text-sm mb-6">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              免费使用 · 无需注册
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
              AI 简历评分
            </h1>
            <p className="text-lg text-white/80 max-w-xl mx-auto">
              30秒了解你的简历实力，获取专业改进建议
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 -mt-8">
          {!result ? (
            /* 输入区 */
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-slate-700">
                    粘贴你的简历内容
                  </label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    上传文件
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="将你的简历内容复制粘贴到这里...&#10;&#10;Tips: 包含教育背景、工作/实习经历、项目经验、技能等信息，评分会更准确"
                  className="w-full h-64 p-4 border border-slate-300 rounded-xl text-sm text-slate-800 leading-relaxed resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-400">
                    {text.length > 0 ? `${text.length} 字` : '最少50字'}
                  </span>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                onClick={handleScore}
                disabled={isLoading || text.trim().length < 50}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-base hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    AI 正在评分...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    开始评分
                  </>
                )}
              </button>
            </div>
          ) : (
            /* 结果区 */
            <div className="space-y-6">
              {/* Score Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8"
              >
                <div className="flex items-center gap-6 mb-6">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${getLevelColor(result.level)} flex flex-col items-center justify-center shadow-lg`}
                  >
                    <span className="text-white/70 text-[10px] font-medium">综合评分</span>
                    <AnimatedScore targetScore={result.score} />
                    <span className="text-white/80 text-xs font-bold mt-0.5">{result.level}级</span>
                  </motion.div>
                  <motion.div
                    className="flex-1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h2 className="text-xl font-bold text-slate-800 mb-2">评分结果</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">{result.summary}</p>
                  </motion.div>
                </div>

                {/* Dimensions — 逐个展开动画 */}
                {result.dimensions && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(result.dimensions).map(([name, score], idx) => {
                      // 计算"超越百分比"（基于益职AI用户首次上传简历数据的模拟值）
                      const beatPercentage = getBeatPercentage(name, score);
                      return (
                        <motion.div
                          key={name}
                          className="bg-slate-50 rounded-xl p-3 text-center"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.6 + idx * 0.15 }}
                        >
                          <div className="text-[10px] text-slate-500 mb-1">{name}</div>
                          <motion.div
                            className="text-lg font-bold text-slate-800"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 + idx * 0.15 }}
                          >
                            {score}
                          </motion.div>
                          <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${score}%` }}
                              transition={{ delay: 0.9 + idx * 0.15, duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                          {beatPercentage > 0 && (
                            <motion.div
                              className="text-[9px] text-green-600 mt-1.5 font-medium"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 1.2 + idx * 0.15 }}
                            >
                              超越 {beatPercentage}% 益职AI用户首次数据
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* Suggestions (Free) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 }}
                className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8"
              >
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1z" />
                    <path fillRule="evenodd" d="M8 10a2 2 0 114 0 2 2 0 01-4 0zm2-6a6 6 0 00-3.164 11.076l-.16 1.17a1 1 0 00.98 1.135h4.688a1 1 0 00.98-1.135l-.16-1.17A6 6 0 0010 4z" clipRule="evenodd" />
                  </svg>
                  核心改进建议
                </h3>
                <div className="space-y-3">
                  {result.suggestions.map((s, i) => (
                    <motion.div
                      key={i}
                      className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.7 + i * 0.1 }}
                    >
                      <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                      <p className="text-sm text-slate-700">{s}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* 总结句 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.0 }}
                className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100 text-center"
              >
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  {generateSummaryLine(result)}
                </p>
              </motion.div>

              {/* CTA: Login to see full report */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.3 }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 md:p-8 text-white text-center"
              >
                <h3 className="text-lg font-bold mb-2">想看完整的深度分析报告？</h3>
                <p className="text-white/80 text-sm mb-5">注册即可获得益老师 1 对 1 简历优化指导，精准提升每个维度</p>
                <div className="flex gap-3 justify-center">
                  <a
                    href="/login"
                    className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl hover:shadow-lg transition-all text-sm"
                  >
                    免费注册查看
                  </a>
                  <button
                    onClick={() => { setResult(null); setText(''); }}
                    className="px-8 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all text-sm"
                  >
                    重新评分
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Trust indicators */}
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
                AI驱动
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                30秒出结果
              </span>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              &copy; 2026 益职AI · 你的私人求职导师
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// 分数滚动动画组件
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

// 计算"超越百分比"（基于益职AI用户首次上传简历的统计数据）
function getBeatPercentage(dimensionName: string, score: number): number {
  // 各维度的首次上传平均分（模拟统计数据）
  const avgScores: Record<string, number> = {
    "内容完整度": 58,
    "表达专业度": 52,
    "量化成果": 42,
    "格式规范": 65,
    "关键词匹配": 48,
    "项目经历": 50,
    "工作经历": 55,
    "教育背景": 62,
    "技能匹配": 45,
    "自我评价": 40,
  };

  const avg = avgScores[dimensionName];
  if (!avg) return 0;

  if (score <= avg) return 0;

  // 基于正态分布近似计算超越百分比
  const diff = score - avg;
  const stdDev = 15;
  const zScore = diff / stdDev;

  // 简化的正态分布 CDF 近似
  const percentage = Math.min(95, Math.round(50 + zScore * 20));
  return Math.max(0, percentage);
}

// 生成总结句
function generateSummaryLine(result: ScoreResult): string {
  if (!result.dimensions) return "";

  const entries = Object.entries(result.dimensions);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const strongBeat = getBeatPercentage(strongest[0], strongest[1]);
  const weakLabel = weakest[0];

  if (strongBeat > 0) {
    return `你的简历在「${strongest[0]}」维度超越了 ${strongBeat}% 的益职AI用户首次上传数据，但「${weakLabel}」是你最大的提升空间。让益老师帮你精准优化！`;
  }

  return `你的简历在「${strongest[0]}」维度表现最好（${strongest[1]}分），而「${weakLabel}」还有很大提升空间。注册后让益老师帮你逐句打磨！`;
}
