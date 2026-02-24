"use client";

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

export interface ShareCardData {
  overallScore: number;
  roundType: string;
  jd: string;
  strengths: string[];
  weaknesses: string[];
  personalityTag?: string;
  percentileRank?: number;
  questionCount: number;
  date: string;
}

interface InterviewShareCardProps {
  data: ShareCardData;
  onClose: () => void;
}

export default function InterviewShareCard({ data, onClose }: InterviewShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 根据分数确定等级和颜色
  const getScoreLevel = (score: number) => {
    if (score >= 90) return { level: 'S', color: '#f59e0b', bg: 'from-amber-400 to-orange-500', label: '卓越' };
    if (score >= 80) return { level: 'A', color: '#22c55e', bg: 'from-emerald-400 to-green-500', label: '优秀' };
    if (score >= 70) return { level: 'B', color: '#3b82f6', bg: 'from-blue-400 to-indigo-500', label: '良好' };
    if (score >= 60) return { level: 'C', color: '#8b5cf6', bg: 'from-violet-400 to-purple-500', label: '合格' };
    return { level: 'D', color: '#ef4444', bg: 'from-red-400 to-rose-500', label: '需提升' };
  };

  const scoreInfo = getScoreLevel(data.overallScore);
  // 使用确定性计算避免 Math.random() 在渲染中导致不稳定
  const percentile = data.percentileRank || Math.min(99, Math.max(50, Math.round(data.overallScore * 0.95 + (data.overallScore % 7))));

  // 生成个性化标签
  const tag = data.personalityTag || generateTag(data.strengths);

  const handleSaveImage = async () => {
    if (!cardRef.current || isSaving) return;
    setIsSaving(true);

    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        width: 375,
        height: 600,
      });

      const link = document.createElement('a');
      link.download = `面试战报_${data.date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* 卡片本体 - 固定尺寸用于导出 */}
        <div
          ref={cardRef}
          className="w-[375px] h-[600px] rounded-2xl overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
        >
          {/* 装饰背景 */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full" style={{ background: `radial-gradient(circle, ${scoreInfo.color}33, transparent 70%)` }} />
            <div className="absolute bottom-[-40px] left-[-40px] w-[160px] h-[160px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.15), transparent 70%)' }} />
            {/* 网格装饰 */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </div>

          <div className="relative h-full flex flex-col p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg overflow-hidden">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-white/60 text-xs font-medium">益职AI · 面试战报</span>
              </div>
              <span className="text-white/40 text-xs">{data.date}</span>
            </div>

            {/* Score Section */}
            <div className="flex items-center gap-5 mb-6">
              <div className="relative">
                <div className={`w-[88px] h-[88px] rounded-2xl bg-gradient-to-br ${scoreInfo.bg} flex flex-col items-center justify-center shadow-lg`}>
                  <span className="text-white/70 text-[10px] font-medium">综合评分</span>
                  <span className="text-white text-3xl font-extrabold leading-none">{data.overallScore}</span>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center">
                  <span className="text-sm font-black" style={{ color: scoreInfo.color }}>{scoreInfo.level}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-white font-bold text-lg mb-1">{data.roundType}</div>
                <div className="text-white/50 text-xs mb-2 line-clamp-1">{data.jd || '模拟面试'}</div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/10">
                  <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                  <span className="text-white/80 text-[11px] font-semibold">超越 {percentile}% 的求职者</span>
                </div>
              </div>
            </div>

            {/* Personality Tag */}
            <div className="mb-5 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-center">
              <span className="text-white/40 text-[10px]">面试官评语</span>
              <p className="text-white/90 text-sm font-medium mt-0.5">{tag}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl bg-white/[0.06] border border-white/[0.08] p-3">
                <div className="text-white/40 text-[10px] mb-1">优势表现</div>
                <div className="space-y-1">
                  {data.strengths.slice(0, 2).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-emerald-400" />
                      <span className="text-white/80 text-[11px] line-clamp-1">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.06] border border-white/[0.08] p-3">
                <div className="text-white/40 text-[10px] mb-1">提升空间</div>
                <div className="space-y-1">
                  {data.weaknesses.slice(0, 2).map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-amber-400" />
                      <span className="text-white/80 text-[11px] line-clamp-1">{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto flex items-end justify-between">
              <div>
                <div className="text-white/30 text-[10px] mb-1">共回答 {data.questionCount} 道题目</div>
                <div className="text-white/50 text-[10px]">扫码免费体验3次AI模拟面试 →</div>
              </div>
              <div className="w-14 h-14 rounded-lg bg-white p-1.5">
                {/* QR placeholder - replace with actual QR code */}
                <div className="w-full h-full rounded bg-slate-100 flex items-center justify-center">
                  <img src="/logo.png" alt="QR" className="w-8 h-8 object-contain" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveImage}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm disabled:opacity-50"
          >
            {saved ? '已保存' : isSaving ? '生成中...' : '保存为图片'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/90 text-slate-700 font-medium rounded-xl shadow-lg hover:shadow-xl transition-all text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function generateTag(strengths: string[]): string {
  const tags = [
    "善于结构化表达的实战型选手",
    "逻辑清晰、数据驱动的分析者",
    "沟通力强、善于抓住核心问题",
    "有深度思考能力的候选人",
    "表达流畅、思路敏捷的沟通达人",
  ];
  if (strengths.length > 0) {
    const keyword = strengths[0];
    return `擅长${keyword}的优质候选人`;
  }
  // 使用确定性选择避免 Math.random() 导致 hydration 不匹配
  return tags[0];
}
