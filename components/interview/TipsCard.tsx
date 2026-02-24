/**
 * 提示卡片组件
 * 显示问题的考察意图、回答要点、框架等信息
 * 
 * ⚠️ 此组件已禁用 - 旧面试逻辑已移除
 * 现在使用 /app/interview/start/page.tsx 中的新面试系统
 */

"use client";

import { motion } from "framer-motion";
import { QuestionTips } from "@/store/interviewStore";
import { parseMarkdownBold } from "@/lib/markdown-utils";

interface TipsCardProps {
  tips: QuestionTips;
}

export default function TipsCard({ tips }: TipsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border border-cyan-200 shadow-sm p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-2xl">💡</span>
        答题提示
      </h3>

      <div className="space-y-4">
        {/* 考察意图 */}
        {tips.intent && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">考察意图</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(tips.intent)}</p>
          </div>
        )}

        {/* 回答要点 */}
        {tips.keyPoints && tips.keyPoints.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">回答要点</h4>
            <ul className="space-y-1">
              {tips.keyPoints.map((point, index) => (
                <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span className="leading-relaxed">{parseMarkdownBold(point)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 回答框架 */}
        {tips.framework && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">回答框架</h4>
            <div className="bg-white rounded-lg p-3 border border-cyan-200">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {parseMarkdownBold(tips.framework)}
              </p>
            </div>
          </div>
        )}

        {/* 行业特性 */}
        {tips.industryNotes && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">行业特性</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(tips.industryNotes)}</p>
          </div>
        )}

        {/* 避坑点 */}
        {tips.pitfalls && tips.pitfalls.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-red-700 mb-2">⚠️ 避坑点</h4>
            <ul className="space-y-1">
              {tips.pitfalls.map((pitfall, index) => (
                <li key={index} className="text-sm text-red-600 flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span className="leading-relaxed">{parseMarkdownBold(pitfall)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 内行窍门 */}
        {tips.proTips && tips.proTips.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-green-700 mb-2">✨ 内行窍门</h4>
            <ul className="space-y-1">
              {tips.proTips.map((tip, index) => (
                <li key={index} className="text-sm text-green-700 flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span className="leading-relaxed">{parseMarkdownBold(tip)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}








