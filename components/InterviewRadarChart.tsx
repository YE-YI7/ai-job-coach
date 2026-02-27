"use client";

import { useState } from "react";

interface Dimension {
  name: string;
  score: number;
  comment: string;
}

interface InterviewRadarChartProps {
  dimensions: Dimension[];
  size?: number;
}

export default function InterviewRadarChart({ dimensions, size = 260 }: InterviewRadarChartProps) {
  const [activeDim, setActiveDim] = useState<number | null>(null);

  if (!dimensions || dimensions.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36; // 最大半径
  const levels = 5; // 5个等级圆
  const count = dimensions.length; // 7个维度
  const angleStep = (Math.PI * 2) / count;
  const startAngle = -Math.PI / 2; // 从顶部开始

  // 计算某维度在极坐标上的位置
  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // 生成等级圆的多边形路径
  const getLevelPath = (level: number) => {
    const r = (level / levels) * maxR;
    const points = Array.from({ length: count }, (_, i) => {
      const angle = startAngle + i * angleStep;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return points.join(" ");
  };

  // 生成数据多边形路径
  const dataPoints = dimensions.map((d, i) => getPoint(i, d.score));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // 维度标签位置（稍微偏离圆外）
  const labelOffset = maxR + 28;
  const labels = dimensions.map((d, i) => {
    const angle = startAngle + i * angleStep;
    const x = cx + labelOffset * Math.cos(angle);
    const y = cy + labelOffset * Math.sin(angle);
    return { x, y, name: d.name, score: d.score };
  });

  // 分数对应的颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10b981"; // emerald
    if (score >= 60) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  return (
    <div className="relative">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto"
      >
        {/* 等级圆 */}
        {Array.from({ length: levels }, (_, i) => (
          <polygon
            key={`level-${i}`}
            points={getLevelPath(i + 1)}
            fill="none"
            stroke={i === levels - 1 ? "#e5e7eb" : "#f3f4f6"}
            strokeWidth={i === levels - 1 ? 1.5 : 0.8}
            strokeDasharray={i < levels - 1 ? "3,3" : "none"}
          />
        ))}

        {/* 轴线 */}
        {dimensions.map((_, i) => {
          const end = getPoint(i, 100);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="#e5e7eb"
              strokeWidth={0.8}
            />
          );
        })}

        {/* 数据区域 - 渐变填充 */}
        <defs>
          <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <polygon
          points={dataPath}
          fill="url(#radarGrad)"
          stroke="#f97316"
          strokeWidth={2}
          strokeLinejoin="round"
          className="transition-all duration-500"
        />

        {/* 数据点 */}
        {dataPoints.map((p, i) => (
          <g key={`dot-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={activeDim === i ? 5.5 : 4}
              fill="white"
              stroke="#f97316"
              strokeWidth={2}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setActiveDim(i)}
              onMouseLeave={() => setActiveDim(null)}
              onTouchStart={() => setActiveDim(activeDim === i ? null : i)}
            />
            {/* 分数标注（悬浮时显示） */}
            {activeDim === i && (
              <text
                x={p.x}
                y={p.y - 12}
                textAnchor="middle"
                fill="#f97316"
                fontSize="11"
                fontWeight="700"
                style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}
              >
                {dimensions[i].score}
              </text>
            )}
          </g>
        ))}

        {/* 维度标签 */}
        {labels.map((l, i) => {
          const isActive = activeDim === i;
          return (
            <g
              key={`label-${i}`}
              className="cursor-pointer"
              onMouseEnter={() => setActiveDim(i)}
              onMouseLeave={() => setActiveDim(null)}
              onTouchStart={() => setActiveDim(activeDim === i ? null : i)}
            >
              <text
                x={l.x}
                y={l.y - 5}
                textAnchor="middle"
                fill={isActive ? "#ea580c" : "#78716c"}
                fontSize="11"
                fontWeight={isActive ? "600" : "500"}
                style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Noto Sans SC', sans-serif", transition: "all 0.2s" }}
              >
                {l.name}
              </text>
              <text
                x={l.x}
                y={l.y + 9}
                textAnchor="middle"
                fill={getScoreColor(l.score)}
                fontSize="11"
                fontWeight="700"
                style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}
              >
                {l.score}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 悬浮维度点评 */}
      {activeDim !== null && dimensions[activeDim]?.comment && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md border border-stone-200/60 max-w-[220px] text-center transition-all duration-200">
          <p className="text-xs text-stone-600 leading-relaxed" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Noto Sans SC', sans-serif" }}>
            {dimensions[activeDim].comment}
          </p>
        </div>
      )}
    </div>
  );
}

// 能力等级标签组件
export function GradeBadge({ grade, gradeNext, overallScore }: { grade: string; gradeNext: string; overallScore: number }) {
  const gradeConfig: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    S: { bg: "from-amber-400 to-yellow-300", text: "text-amber-900", border: "border-amber-300", glow: "shadow-amber-200/50" },
    A: { bg: "from-emerald-400 to-teal-300", text: "text-emerald-900", border: "border-emerald-300", glow: "shadow-emerald-200/50" },
    "B+": { bg: "from-blue-400 to-cyan-300", text: "text-blue-900", border: "border-blue-300", glow: "shadow-blue-200/50" },
    B: { bg: "from-indigo-400 to-blue-300", text: "text-indigo-900", border: "border-indigo-300", glow: "shadow-indigo-200/50" },
    C: { bg: "from-orange-400 to-amber-300", text: "text-orange-900", border: "border-orange-300", glow: "shadow-orange-200/50" },
    D: { bg: "from-stone-400 to-stone-300", text: "text-stone-800", border: "border-stone-300", glow: "shadow-stone-200/50" },
  };

  const config = gradeConfig[grade] || gradeConfig.B;

  return (
    <div className="flex items-center gap-3">
      {/* 等级徽章 */}
      <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${config.bg} ${config.border} border flex items-center justify-center shadow-lg ${config.glow}`}>
        <span
          className={`text-2xl font-black ${config.text}`}
          style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}
        >
          {grade}
        </span>
      </div>
      {/* 分数 + 进阶提示 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-black bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent"
            style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}
          >
            {overallScore}
          </span>
          <span className="text-xs text-stone-400 font-medium">/ 100</span>
        </div>
        {gradeNext && (
          <p className="text-xs text-stone-500 mt-0.5 truncate" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Noto Sans SC', sans-serif" }}>
            {gradeNext}
          </p>
        )}
      </div>
    </div>
  );
}
