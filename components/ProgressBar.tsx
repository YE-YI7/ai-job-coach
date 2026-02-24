"use client";

import { useMemo } from 'react';
import type { WhiteboardData } from './Whiteboard';
import type { UserStage } from '@/lib/stage';
import { calculateProgress } from '@/lib/progress';

interface ProgressBarProps {
  data?: WhiteboardData;
  currentStage?: UserStage;
  onStageClick?: (stage: UserStage) => void;
}

// 阶段颜色映射
const STAGE_COLORS: Record<string, { ring: string; bg: string; text: string; track: string }> = {
  career_planning:      { ring: 'stroke-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-600',    track: 'stroke-blue-100' },
  project_review:       { ring: 'stroke-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-600',  track: 'stroke-indigo-100' },
  resume_optimization:  { ring: 'stroke-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-600',  track: 'stroke-orange-100' },
  application_strategy: { ring: 'stroke-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', track: 'stroke-emerald-100' },
  interview:            { ring: 'stroke-cyan-500',    bg: 'bg-cyan-50',    text: 'text-cyan-600',    track: 'stroke-cyan-100' },
  salary_talk:          { ring: 'stroke-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-600',    track: 'stroke-rose-100' },
  offer:                { ring: 'stroke-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-600',  track: 'stroke-purple-100' },
};

export default function ProgressBar({ data, currentStage, onStageClick }: ProgressBarProps) {
  const progress = useMemo(() => calculateProgress(data), [data]);

  const totalPercentage = useMemo(() => {
    const total = progress.reduce((sum, p) => sum + p.percentage, 0);
    return Math.round(total / progress.length);
  }, [progress]);

  return (
    <div className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200/60">
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">求职准备度</span>
            <span className="text-xs font-bold text-orange-500">{totalPercentage}%</span>
          </div>
          <div className="h-1.5 flex-1 mx-4 bg-slate-100 rounded-full overflow-hidden max-w-[160px]">
            <div 
              className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${totalPercentage}%` }}
            />
          </div>
        </div>

        {/* Stage cards - horizontal scroll */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollSnapType: 'x mandatory' }}>
          {progress.map((p) => {
            const colors = STAGE_COLORS[p.stage] || STAGE_COLORS.career_planning;
            const isActive = currentStage === p.stage;
            const circumference = 2 * Math.PI * 18;
            const dashOffset = circumference - (p.percentage / 100) * circumference;

            return (
              <button
                key={p.stage}
                onClick={() => onStageClick?.(p.stage)}
                className={`flex-shrink-0 flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? `${colors.bg} ring-2 ring-offset-1 ring-orange-300 scale-105` 
                    : 'hover:bg-slate-50'
                }`}
                style={{ scrollSnapAlign: 'start', minWidth: '68px' }}
              >
                {/* Mini ring chart */}
                <div className="relative w-11 h-11">
                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                    <circle
                      cx="22" cy="22" r="18"
                      fill="none"
                      strokeWidth="3"
                      className={colors.track}
                    />
                    <circle
                      cx="22" cy="22" r="18"
                      fill="none"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className={colors.ring}
                      style={{
                        strokeDasharray: circumference,
                        strokeDashoffset: dashOffset,
                        transition: 'stroke-dashoffset 0.8s ease-out',
                      }}
                    />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${colors.text}`}>
                    {p.percentage}
                  </span>
                </div>
                {/* Label */}
                <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? colors.text : 'text-slate-500'}`}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
