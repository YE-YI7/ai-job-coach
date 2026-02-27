"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type QuestionAnalysis = {
  interviewer_question: string;
  intent: string;
  user_answer_summary: string;
  strengths: string[];
  weaknesses: string[];
  suggested_answer_points: string[];
  score: string;
};

type ReviewAnalysis = {
  overall_grade: string;
  overall_comment: string;
  improvement_potential: string;
  questions: QuestionAnalysis[];
  key_strengths: string[];
  key_improvements: string[];
  action_items: string[];
};

// 评级颜色映射
const gradeColors: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  A: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "A+": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "A-": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  B: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "B+": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "B-": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  C: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "C+": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  D: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

const getGradeColor = (grade: string) =>
  gradeColors[grade] || { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" };

export default function InterviewReviewPage() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<"text" | "audio">("text");
  const [interviewText, setInterviewText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 追问功能
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpMessages, setFollowUpMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [isFollowingUp, setIsFollowingUp] = useState(false);

  // 展开/折叠的题目
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const followUpRef = useRef<HTMLDivElement>(null);

  const toggleQuestion = (idx: number) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (!interviewText.trim()) {
      setError("请先输入面试内容");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch("/api/interview/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewContent: interviewText.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "分析失败");
      setAnalysis(data.analysis);
      // 默认展开第一个问题
      setExpandedQuestions(new Set([0]));
    } catch (err: any) {
      setError(err.message || "分析失败，请重试");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpInput.trim() || !analysis) return;

    const question = followUpInput.trim();
    setFollowUpInput("");
    setFollowUpMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsFollowingUp(true);

    try {
      const contextSummary = `整体评级: ${analysis.overall_grade}\n评语: ${analysis.overall_comment}\n分析了${analysis.questions.length}个问题`;
      const res = await fetch("/api/interview/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUpQuestion: question,
          context: contextSummary,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFollowUpMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err: any) {
      setFollowUpMessages((prev) => [
        ...prev,
        { role: "assistant", content: `分析失败: ${err.message}` },
      ]);
    } finally {
      setIsFollowingUp(false);
      setTimeout(() => followUpRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">面试复盘</h1>
              <p className="text-xs text-gray-500">粘贴面试对话，获取专业AI分析</p>
            </div>
          </div>
          {analysis && (
            <div className={`px-4 py-2 rounded-xl ${getGradeColor(analysis.overall_grade).bg} ${getGradeColor(analysis.overall_grade).border} border`}>
              <span className={`text-lg font-bold ${getGradeColor(analysis.overall_grade).text}`}>
                {analysis.overall_grade}
              </span>
              {analysis.improvement_potential && (
                <span className="text-xs text-gray-500 ml-2">
                  → {analysis.improvement_potential}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Input Area - only show when no analysis */}
        {!analysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            {/* Mode Toggle */}
            <div className="px-6 pt-5 pb-3">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setInputMode("text")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    inputMode === "text"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  📝 文本粘贴
                </button>
                <button
                  onClick={() => setInputMode("audio")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    inputMode === "audio"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  🎙️ 录音转文字
                </button>
              </div>

              {inputMode === "text" ? (
                <div>
                  <textarea
                    value={interviewText}
                    onChange={(e) => setInterviewText(e.target.value)}
                    placeholder={`粘贴面试对话记录...

格式建议（不强制）：
面试官：请你自我介绍一下
我：我是xxx，目前在xxx公司担任xxx...

面试官：你在这个项目中具体负责什么？
我：我主要负责了...`}
                    className="w-full h-56 px-4 py-3 border border-gray-200 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    支持任意格式的面试对话记录，AI 会自动识别面试官问题和你的回答
                  </p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                  <div className="text-4xl mb-3">🎙️</div>
                  <p className="text-sm text-gray-600 mb-2">录音转文字功能即将上线</p>
                  <p className="text-xs text-gray-400">
                    目前可以先用手机录音，通过微信/飞书等工具转为文字后粘贴
                  </p>
                  <button
                    onClick={() => setInputMode("text")}
                    className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                  >
                    切换到文本粘贴
                  </button>
                </div>
              )}
            </div>

            {/* Analyze Button */}
            <div className="px-6 pb-5">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !interviewText.trim()}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-200/50 active:scale-[0.98]"
              >
                {isAnalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在深度分析你的面试表现...
                  </span>
                ) : (
                  "开始分析"
                )}
              </button>

              {error && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Analysis Result */}
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Overall Comment */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm text-gray-700 leading-relaxed">{analysis.overall_comment}</p>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.key_strengths.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs">✓</span>
                    核心优势
                  </h3>
                  <div className="space-y-2">
                    {analysis.key_strengths.map((s, i) => (
                      <p key={i} className="text-sm text-gray-600 leading-relaxed pl-1">• {s}</p>
                    ))}
                  </div>
                </div>
              )}
              {analysis.key_improvements.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-xs">↑</span>
                    改进方向
                  </h3>
                  <div className="space-y-2">
                    {analysis.key_improvements.map((s, i) => (
                      <p key={i} className="text-sm text-gray-600 leading-relaxed pl-1">• {s}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Question-by-Question Analysis */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">逐题分析</h3>
              <div className="space-y-3">
                {analysis.questions.map((q, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Question Header */}
                    <button
                      onClick={() => toggleQuestion(idx)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${getGradeColor(q.score).bg} ${getGradeColor(q.score).text}`}>
                          {q.score}
                        </span>
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {q.interviewer_question}
                        </span>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${expandedQuestions.has(idx) ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {expandedQuestions.has(idx) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
                            {/* Intent */}
                            <div className="bg-blue-50/50 rounded-xl p-3">
                              <p className="text-xs font-semibold text-blue-600 mb-1">🎯 考察意图</p>
                              <p className="text-sm text-gray-700">{q.intent}</p>
                            </div>

                            {/* User Answer Summary */}
                            {q.user_answer_summary && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 mb-1">你的回答摘要</p>
                                <p className="text-sm text-gray-600 leading-relaxed">{q.user_answer_summary}</p>
                              </div>
                            )}

                            {/* Strengths & Weaknesses */}
                            <div className="grid grid-cols-2 gap-3">
                              {q.strengths.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-green-600 mb-1.5">✓ 亮点</p>
                                  {q.strengths.map((s, i) => (
                                    <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1">• {s}</p>
                                  ))}
                                </div>
                              )}
                              {q.weaknesses.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-orange-600 mb-1.5">↑ 可改进</p>
                                  {q.weaknesses.map((s, i) => (
                                    <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1">• {s}</p>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Suggested Answer Points */}
                            {q.suggested_answer_points.length > 0 && (
                              <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs font-semibold text-gray-600 mb-1.5">💡 建议回答要点</p>
                                {q.suggested_answer_points.map((p, i) => (
                                  <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1">
                                    {i + 1}. {p}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Action Items */}
            {analysis.action_items.length > 0 && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-5">
                <h3 className="text-sm font-semibold text-orange-800 mb-3">📋 下一步行动计划</h3>
                <div className="space-y-2">
                  {analysis.action_items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-700 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Chat */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-gray-800">💬 追问教练</h3>
                <p className="text-xs text-gray-500 mt-0.5">对分析结果有疑问？想要某个问题的详细参考回答？</p>
              </div>

              {/* Follow-up Messages */}
              {followUpMessages.length > 0 && (
                <div className="px-5 py-3 space-y-3 max-h-80 overflow-y-auto">
                  {followUpMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-orange-500 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-700 rounded-bl-md"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={followUpRef} />
                </div>
              )}

              {/* Input */}
              <div className="px-5 py-3 border-t border-gray-50 flex gap-2">
                <input
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleFollowUp()}
                  placeholder="例如：第2题能给我一个参考回答吗？"
                  disabled={isFollowingUp}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-all placeholder:text-gray-400 disabled:opacity-50"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={isFollowingUp || !followUpInput.trim()}
                  className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors shrink-0"
                >
                  {isFollowingUp ? "..." : "发送"}
                </button>
              </div>
            </div>

            {/* Reset Button */}
            <div className="text-center pb-6">
              <button
                onClick={() => {
                  setAnalysis(null);
                  setInterviewText("");
                  setFollowUpMessages([]);
                  setExpandedQuestions(new Set());
                }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← 分析新的面试
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
