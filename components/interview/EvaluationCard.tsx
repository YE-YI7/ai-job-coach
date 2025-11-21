/**
 * 评估卡片组件
 * 显示问题的评估结果，包括各项评分和改进建议
 */

"use client";

import { motion } from "framer-motion";
import { QuestionEvaluation } from "@/store/interviewStore";

interface EvaluationCardProps {
  evaluation: QuestionEvaluation;
}

/**
 * 评分进度条组件
 */
function ScoreBar({ label, score }: { label: string; score: number }) {
  const percentage = Math.min(Math.max(score, 0), 100);
  const colorClass =
    percentage >= 80
      ? "bg-green-500"
      : percentage >= 60
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-600 font-semibold">{score}分</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full ${colorClass} rounded-full`}
        />
      </div>
    </div>
  );
}

export default function EvaluationCard({ evaluation }: EvaluationCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 shadow-sm p-6 mt-4"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        评估结果
      </h3>

      <div className="space-y-4">
        {/* 评分项 */}
        <div className="space-y-3">
          <ScoreBar label="准确性" score={evaluation.accuracy} />
          <ScoreBar label="详细度" score={evaluation.detail} />
          <ScoreBar label="逻辑性" score={evaluation.logic} />
          <ScoreBar label="自信度" score={evaluation.confidence} />
        </div>

        {/* 综合评分 */}
        <div className="pt-3 border-t border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">综合评分</span>
            <span className="text-2xl font-bold text-purple-600">
              {Math.round(
                (evaluation.accuracy +
                  evaluation.detail +
                  evaluation.logic +
                  evaluation.confidence) /
                  4
              )}
            </span>
          </div>
        </div>

        {/* 改进建议 */}
        {evaluation.tips && (
          <div className="pt-3 border-t border-purple-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">💬 改进建议</h4>
            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {evaluation.tips}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}



