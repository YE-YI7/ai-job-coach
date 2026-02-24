"use client";

import React, { useState } from "react";

interface ResumeDiffProps {
  original: string;
  optimized: string;
  suggestion?: string;
  section?: string;
}

export default function ResumeDiff({ original, optimized, suggestion, section }: ResumeDiffProps) {
  const [showSuggestion, setShowSuggestion] = useState(false);

  // 简单的文本差异高亮（实际可以使用更复杂的 diff 算法）
  const highlightDiff = (original: string, optimized: string) => {
    // 如果文本完全相同，直接返回
    if (original === optimized) {
      return <span>{optimized}</span>;
    }

    // 简单的单词级别对比
    const originalWords = original.split(/\s+/);
    const optimizedWords = optimized.split(/\s+/);
    
    // 找出新增或修改的词汇
    // 使用 React.ReactElement[] 替代 JSX.Element[]，确保 TypeScript 能正确识别类型
    const result: React.ReactElement[] = [];
    let origIdx = 0;
    let optIdx = 0;

    while (optIdx < optimizedWords.length) {
      if (origIdx < originalWords.length && originalWords[origIdx] === optimizedWords[optIdx]) {
        result.push(<span key={optIdx}>{optimizedWords[optIdx]} </span>);
        origIdx++;
        optIdx++;
      } else {
        // 这是新增或修改的部分
        result.push(
          <mark
            key={optIdx}
            className="bg-yellow-200 text-gray-900 font-semibold px-1 rounded"
          >
            {optimizedWords[optIdx]}{" "}
          </mark>
        );
        optIdx++;
        // 尝试在原文中找到下一个匹配的词
        if (origIdx < originalWords.length) {
          origIdx++;
        }
      }
    }

    return <span>{result}</span>;
  };

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      {section && (
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {section}
        </div>
      )}

      {/* 原始句子 */}
      <div className="p-3 bg-gray-100 rounded-lg">
        <div className="text-xs font-medium text-gray-500 mb-1">原始句子</div>
        <div className="text-sm text-gray-700 line-through">{original}</div>
      </div>

      {/* 优化后句子 */}
      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
        <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-2">
          <span>优化后</span>
          <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded text-xs">
            改进点
          </span>
        </div>
        <div className="text-sm text-gray-900">
          {highlightDiff(original, optimized)}
        </div>
      </div>

      {/* 建议说明（悬浮显示） */}
      {suggestion && (
        <div className="relative">
          <button
            onMouseEnter={() => setShowSuggestion(true)}
            onMouseLeave={() => setShowSuggestion(false)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            💡 查看优化原因
          </button>
          {showSuggestion && (
            <div className="absolute left-0 top-6 z-10 w-64 p-3 bg-white rounded-lg border border-gray-200 shadow-lg">
              <div className="text-xs text-gray-700">{suggestion}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

