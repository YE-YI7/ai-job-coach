"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TailoredResumeResult {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
}

interface ResumeTailorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentResume: {
    personalInfo: string;
    education: string;
    campusExperience: string;
    projects: string;
    workExperience: string;
    selfEvaluation: string;
  };
  onApplyTailored: (data: TailoredResumeResult) => void;
}

export default function ResumeTailorPanel({
  isOpen,
  onClose,
  currentResume,
  onApplyTailored,
}: ResumeTailorPanelProps) {
  const [jobDescription, setJobDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    tailoredResume: TailoredResumeResult;
    adjustmentNotes: string[];
    matchScore: number | null;
    keyMatches: string[];
    gaps: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      setError("请先粘贴目标岗位的JD");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeData: currentResume,
          jobDescription: jobDescription.trim(),
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "生成失败");
      }

      setResult({
        tailoredResume: data.tailoredResume,
        adjustmentNotes: data.adjustmentNotes,
        matchScore: data.matchScore,
        keyMatches: data.keyMatches,
        gaps: data.gaps,
      });
    } catch (err: any) {
      setError(err.message || "生成失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (result?.tailoredResume) {
      onApplyTailored(result.tailoredResume);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">针对性简历生成</h2>
                <p className="text-xs text-gray-500 mt-0.5">粘贴目标岗位JD，AI自动调整简历侧重点</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* JD Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  目标岗位 JD
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="粘贴完整的岗位职责和要求..."
                  className="w-full h-40 px-3 py-2.5 border border-gray-200 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-all placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  建议粘贴完整的JD，包括岗位职责、任职要求、加分项等
                </p>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isLoading || !jobDescription.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-200/50 active:scale-[0.98]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在分析 JD 并调整简历...
                  </span>
                ) : (
                  "生成针对性简历"
                )}
              </button>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Result */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Match Score */}
                  {result.matchScore !== null && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0">
                        <span className="text-lg font-bold text-white">{result.matchScore}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">岗位匹配度</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {result.matchScore >= 80 ? "匹配度很高，简历已针对性优化" :
                           result.matchScore >= 60 ? "匹配度中等，建议补强相关经历" :
                           "匹配度较低，建议重点调整经历描述"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Key Matches */}
                  {result.keyMatches.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">匹配的关键能力</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {result.keyMatches.map((match, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-full bg-green-50 text-xs font-medium text-green-700 border border-green-100">
                            ✓ {match}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gaps */}
                  {result.gaps.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">需要补强</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {result.gaps.map((gap, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-full bg-orange-50 text-xs font-medium text-orange-700 border border-orange-100">
                            ↑ {gap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Adjustment Notes */}
                  {result.adjustmentNotes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">调整说明</h4>
                      <div className="space-y-2">
                        {result.adjustmentNotes.map((note, i) => (
                          <div key={i} className="flex gap-2 text-sm text-gray-600">
                            <span className="text-orange-500 shrink-0 mt-0.5">•</span>
                            <span className="leading-relaxed">{note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Apply Button */}
                  <button
                    onClick={handleApply}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md active:scale-[0.98]"
                  >
                    应用到简历编辑器
                  </button>
                  <p className="text-xs text-center text-gray-400">
                    应用后可在编辑器中继续微调
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
