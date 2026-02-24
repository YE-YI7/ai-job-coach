"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import { WhiteboardData } from "@/components/Whiteboard";
import InputBar from "@/components/InputBar";
import MessageBubble from "@/components/MessageBubble";
import NextActionChips from "@/components/NextActionChips";
import { Confetti, CelebrationModal, getRandomMessage, type EncouragementType } from "@/components/CelebrationSystem";
import type { RoundType, InterviewQuestion } from "@/lib/interview/types";
import { parseMarkdownBold } from "@/lib/markdown-utils";
import InterviewShareCard from "@/components/InterviewShareCard";
import type { ShareCardData } from "@/components/InterviewShareCard";

// FIX: interview/start 页面永远使用固定阶段：interview
// 不读取 localStorage.current_stage，不从全局 stage store 恢复 chat 阶段
const FIXED_STAGE = "interview";

// ========== 消息类型定义 ==========

type MessageType = 
  | { type: "config"; jd: string; roundType: RoundType; questionCount: number }
  | { type: "question"; question: InterviewQuestion; index: number }
  | { type: "user"; content: string }
  | { type: "choice"; questionId: string; questionIndex: number }
  | { type: "assessment"; assessment: any; questionId: string }
  | { type: "summary"; summary: any }
  | { type: "error"; message: string };

interface Message {
  id: string;
  timestamp: Date;
  data: MessageType;
}

// ========== 主组件 ==========

export default function InterviewStartPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ========== 状态管理 ==========
  const [interviewState, setInterviewState] = useState<"idle" | "running" | "finished">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [whiteboardData, setWhiteboardData] = useState<WhiteboardData>({});
  const [showWhiteboard, setShowWhiteboard] = useState(true);

  // 配置状态
  const [jd, setJd] = useState("");
  const [roundType, setRoundType] = useState<RoundType>("业务面");
  const [questionCount, setQuestionCount] = useState(3);
  
  // 智能引导状态
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // 简历关联状态
  const [useResume, setUseResume] = useState(true);
  const [hasResume, setHasResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 分享卡片状态
  const [shareCardData, setShareCardData] = useState<ShareCardData | null>(null);

  // 庆祝状态
  const [showConfetti, setShowConfetti] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationType, setCelebrationType] = useState<EncouragementType>("interview_excellent");
  const [celebrationTitle, setCelebrationTitle] = useState("");

  // 触发面试完成庆祝
  const triggerInterviewCelebration = useCallback((score: number) => {
    if (score >= 80) {
      setCelebrationType("interview_excellent");
      setCelebrationTitle("面霸认证！");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } else if (score >= 60) {
      setCelebrationType("interview_good");
      setCelebrationTitle("表现不错！");
    } else if (score > 0) {
      setCelebrationType("interview_start");
      setCelebrationTitle("勇敢的第一步！");
    } else {
      return; // 0分不触发
    }
    setShowCelebration(true);
  }, []);

  // FIX: interview/start 页面初始化
  // 只读取面试配置（jd, roundType, questionCount），不读取或设置全局阶段状态
  // 不重定向到 /chat，即使 jd 为空也保持在当前页面（用户可以在此页面输入配置）
  // 新增：从localStorage恢复历史面试记录
  useEffect(() => {
    const savedJd = localStorage.getItem("interview_role") || "";
    const savedRound = localStorage.getItem("interview_round") || "业务面";
    const savedCount = parseInt(localStorage.getItem("interview_questionCount") || "3");
    
    setJd(savedJd);
    setRoundType(savedRound as RoundType);
    setQuestionCount(savedCount);

    // 从localStorage恢复历史面试记录
    try {
      const savedMessages = localStorage.getItem("interview_messages");
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        // 恢复时间戳为Date对象
        const restoredMessages = parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(restoredMessages);
      }
      // FIX: 如果没有历史记录，不显示初始配置卡片，让页面为空
      // 用户可以直接在配置卡片中填写信息
    } catch (error) {
      console.error("恢复面试记录失败:", error);
      // 恢复失败时也不显示配置卡片，保持空白
    }
    
    // 恢复未完成的 AI 生成状态
    const pendingGeneration = localStorage.getItem("interview_pending_generation");
    if (pendingGeneration) {
      const { sessionId: savedSessionId, questionIndex } = JSON.parse(pendingGeneration);
      // 如果有未完成的生成，恢复状态并继续
      setSessionId(savedSessionId);
      setIsLoading(true);
      // 清除标记
      localStorage.removeItem("interview_pending_generation");
    }
    
    // 查询用户是否有简历数据
    fetch("/api/resume/latest")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data) {
          setHasResume(true);
          setResumeFilename(data.data.filename || "已上传的简历");
        }
      })
      .catch(() => {
        // 静默失败
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 简历上传处理
  const handleResumeUpload = async (file: File) => {
    if (!file) return;
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (!allowedTypes.includes(file.type)) {
      alert("请上传 PDF 或 Word 格式的简历");
      return;
    }
    setIsUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setHasResume(true);
        setUseResume(true);
        setResumeFilename(data.filename || file.name);
      } else {
        const errText = await res.text();
        console.error("简历上传失败:", errText);
        alert("简历上传失败，请重试");
      }
    } catch (e) {
      console.error("简历上传错误:", e);
      alert("上传出错，请重试");
    } finally {
      setIsUploadingResume(false);
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleResumeUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // FIX: 删除重定向到 /chat 的逻辑
  // 即使 jd 为空，用户也应该能在 /interview/start 页面输入配置并开始面试
  // 不再根据配置状态自动重定向，保持页面停留在 /interview/start

  // 保存面试记录到localStorage（每次messages更新时）
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // 将messages保存到localStorage
        localStorage.setItem("interview_messages", JSON.stringify(messages));
      } catch (error) {
        console.error("保存面试记录失败:", error);
      }
    }
  }, [messages]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ========== 开始面试 ==========
  const handleStartInterview = async () => {
    if (!jd.trim() || questionCount < 1) {
      alert("请填写岗位/JD和题目数量");
      return;
    }

    // 保存配置到 localStorage
    localStorage.setItem("interview_role", jd.trim());
    localStorage.setItem("interview_round", roundType);
    localStorage.setItem("interview_questionCount", questionCount.toString());

    setIsLoading(true);

    try {
      // 1. 添加配置卡片（追加到现有记录后面，不清空）
      const configMessage: Message = {
        id: `config_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "config",
          jd: jd.trim(),
          roundType: roundType,
          questionCount: questionCount,
        },
      };
      setMessages((prev) => [...prev, configMessage]);

      // 2. 调用 /api/interview/start
      const response = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd: jd.trim(),
          roundType: roundType,
          questionCount: questionCount,
          useResume: useResume && hasResume,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "启动面试失败", detail: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `启动面试失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.session_id && data.questions && data.questions.length > 0) {
        setSessionId(data.session_id);
        setQuestions(data.questions);
        setInterviewState("running");
        setCurrentIndex(0);

        // 3. 添加第一个问题卡片
        const firstQuestion: Message = {
          id: `question_${Date.now()}`,
          timestamp: new Date(),
          data: {
            type: "question",
            question: data.questions[0],
            index: 0,
          },
        };
        setMessages((prev) => [...prev, firstQuestion]);
      } else {
        throw new Error("API 返回数据格式不正确");
      }
    } catch (error: any) {
      console.error("启动面试失败:", error);
      // 显示错误卡片而不是 alert
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "error",
          message: error.message || "启动面试失败，请稍后重试",
        },
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // ========== 提交答案 ==========
  const handleSubmitAnswer = async () => {
    if (!inputValue.trim() || isLoading || interviewState !== "running" || !sessionId) {
      return;
    }

    const answerText = inputValue.trim();
    const currentQuestion = questions[currentIndex];

    if (!currentQuestion) {
      return;
    }

    setIsLoading(true);
    
    // FIX: 保存生成状态，以便用户离开页面后可以恢复
    localStorage.setItem("interview_pending_generation", JSON.stringify({
      sessionId,
      questionIndex: currentIndex,
    }));

    try {
      // 1. 添加用户回答气泡
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "user",
          content: answerText,
        },
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");

      // 2. 调用 /api/interview/answer
      const response = await fetch("/api/interview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: currentQuestion.id,
          answer: answerText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "提交答案失败", detail: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `提交答案失败: ${response.status}`);
      }

      const data = await response.json();

      // 3. 添加评价卡片
      const assessmentData = data.assessment || data.payload?.assessment || data;
      const assessmentMessage: Message = {
        id: `assessment_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "assessment",
          assessment: assessmentData,
          questionId: currentQuestion.id,
        },
      };
      setMessages((prev) => [...prev, assessmentMessage]);

      // 4. 添加选择卡片
      const choiceMessage: Message = {
        id: `choice_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "choice",
          questionId: currentQuestion.id,
          questionIndex: currentIndex,
        },
      };
      setMessages((prev) => [...prev, choiceMessage]);
      
      // FIX: 生成完成，清除待处理标记
      localStorage.removeItem("interview_pending_generation");
    } catch (error: any) {
      console.error("提交答案失败:", error);
      // 显示错误卡片
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "error",
          message: error.message || "提交答案失败，请稍后重试",
        },
      };
      setMessages((prev) => [...prev, errorMessage]);
      
      // 清除待处理标记
      localStorage.removeItem("interview_pending_generation");
    } finally {
      setIsLoading(false);
    }
  };

  // ========== 重新回答当前问题 ==========
  const handleRetryAnswer = (choiceMessageId: string) => {
    // 移除选择卡片，允许用户重新输入
    setMessages((prev) => prev.filter((m) => m.id !== choiceMessageId));
    // 输入框已经可用，用户可以直接输入新答案
  };

  // ========== 继续下一个问题 ==========
  const handleNextQuestion = async (choiceMessageId: string) => {
    // 移除选择卡片
    setMessages((prev) => prev.filter((m) => m.id !== choiceMessageId));
    
    // 检查是否还有下一题
    const nextIndex = currentIndex + 1;
    if (nextIndex < questions.length) {
      // 等待 2 秒后显示下一题
      setTimeout(() => {
        const nextQuestion: Message = {
          id: `question_${Date.now()}`,
          timestamp: new Date(),
          data: {
            type: "question",
            question: questions[nextIndex],
            index: nextIndex,
          },
        };
        setMessages((prev) => [...prev, nextQuestion]);
        setCurrentIndex(nextIndex);
      }, 2000);
    } else {
      // 所有题目完成，生成总结
      setInterviewState("finished");
      setTimeout(() => {
        generateSummary();
      }, 1000);
    }
  };

  // ========== 生成总结 ==========
  const generateSummary = async () => {
    if (!sessionId) {
      return;
    }

    try {
      // 使用 /api/interview/complete 接口
      const response = await fetch("/api/interview/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "获取总结失败", detail: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `获取总结失败: ${response.status}`);
      }

      const data = await response.json();
      
      // 提取 summary 数据
      const summaryData = data.payload?.summary || data;

      // 添加总结卡片
      const summaryMessage: Message = {
        id: `summary_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "summary",
          summary: summaryData,
        },
      };
      setMessages((prev) => [...prev, summaryMessage]);

      // 将总结写入白板
      // 根据 API 返回格式处理 summary 数据
      const summaryForWhiteboard = summaryData.summary || summaryData.overall || summaryData;
      const dimensions = summaryData.dimensions || [];
      const recommendations = summaryData.recommendations || [];
      
      setWhiteboardData((prev) => ({
        ...prev,
        interviewReports: [
          {
            id: sessionId,
            round: `${roundType}总结`,
            overallScore: summaryData.overallScore || summaryData.score || 0,
            strengths: summaryData.strengths || [],
            improvements: summaryData.weaknesses || summaryData.improvements || [],
            suggestions: recommendations.map((r: any) => typeof r === 'string' ? r : (r.title || r.detail || r)),
            createdAt: new Date().toISOString(),
          },
        ],
      }));

      // 数据飞轮：记录面试分数
      const finalScore = summaryData.overallScore || summaryData.score || 0;
      if (finalScore > 0) {
        fetch("/api/analytics/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "interview",
            metricType: "interview_score",
            metricValue: finalScore,
            metadata: { roundType, questionCount: questions.length, jd },
          }),
        }).catch(() => {});

        // 触发庆祝动画
        setTimeout(() => triggerInterviewCelebration(finalScore), 500);
      }

      // 保存白板数据（如果有保存 API）
      const sessionIdForSave = localStorage.getItem("sessionId");
      if (sessionIdForSave) {
        try {
          await fetch("/api/save-whiteboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionIdForSave,
              whiteboard: {
                interviewReports: [
                  {
                    id: sessionId,
                    round: `${roundType}总结`,
                    overallScore: summaryData.overallScore || summaryData.score || 0,
                    strengths: summaryData.strengths || [],
                    improvements: summaryData.weaknesses || summaryData.improvements || [],
                    suggestions: recommendations.map((r: any) => typeof r === 'string' ? r : (r.title || r.detail || r)),
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
            }),
          });
        } catch (err) {
          console.warn("保存白板数据失败（非关键错误）:", err);
        }
      }

      // 3秒后自动添加新的配置卡片，让用户可以开始下一轮面试
      setTimeout(() => {
        // 重置面试状态
        setInterviewState("idle");
        setCurrentIndex(0);
        setQuestions([]);
        setSessionId(null);
        
        // 添加新的配置卡片
        const newConfigMessage: Message = {
          id: `config_${Date.now()}`,
          timestamp: new Date(),
          data: {
            type: "config",
            jd: jd.trim(),
            roundType: roundType,
            questionCount: questionCount,
          },
        };
        setMessages((prev) => [...prev, newConfigMessage]);
        
        // 滚动到配置卡片
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }, 3000);
    } catch (error: any) {
      console.error("生成总结失败:", error);
      // 显示错误卡片
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        data: {
          type: "error",
          message: error.message || "生成总结失败，请稍后重试",
        },
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  // ========== 渲染消息 ==========
  const renderMessage = (message: Message) => {
    switch (message.data.type) {
      case "config":
        // 如果面试已经开始，不显示配置卡片
        if (interviewState === "running") {
          return null;
        }
        
        return (
          <div key={message.id} className="interview-card glass-card hover-lift animate-scale-in bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200/60 rounded-2xl shadow-lg p-6 my-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md">
                <span className="text-white text-xl">⚙️</span>
              </div>
              <h2 className="text-xl font-semibold text-stone-800">面试配置</h2>
            </div>
            <div className="space-y-4">
              {/* 岗位 JD */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">岗位 / JD</label>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  disabled={isLoading}
                  className="mt-1 w-full border border-stone-300 rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="请输入岗位 JD"
                  rows={3}
                />
              </div>
              {/* 面试轮次 */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">面试轮次</label>
                <select
                  value={roundType}
                  onChange={(e) => setRoundType(e.target.value as RoundType)}
                  disabled={isLoading}
                  className="mt-1 w-full border border-stone-300 rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="业务面">业务面</option>
                  <option value="技术面">技术面</option>
                  <option value="项目深挖">项目深挖</option>
                  <option value="HR面">HR面</option>
                  <option value="总监面">总监面</option>
                </select>
              </div>
              {/* 面试题目数量 */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">题目数量</label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  disabled={isLoading}
                  className="mt-1 w-full border border-stone-300 rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={1}>1 题</option>
                  <option value={2}>2 题</option>
                  <option value={3}>3 题</option>
                  <option value={4}>4 题</option>
                  <option value={5}>5 题</option>
                </select>
              </div>
              {/* 简历关联开关 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-stone-700">关联简历（个性化出题）</label>
                  <button
                    type="button"
                    onClick={() => setUseResume(!useResume)}
                    disabled={!hasResume}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      useResume && hasResume
                        ? "bg-orange-500"
                        : "bg-gray-300"
                    } ${!hasResume ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        useResume && hasResume ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {hasResume ? (
                  <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                    <span>✓</span>
                    <span>已检测到简历：{resumeFilename}</span>
                  </p>
                ) : (
                  <p className="text-xs text-stone-400 mt-1.5">
                    未检测到简历，前往「简历优化」阶段上传简历后可开启
                  </p>
                )}
              </div>
              {/* 启动按钮 */}
              <button
                onClick={handleStartInterview}
                disabled={isLoading || !jd.trim() || questionCount < 1}
                className="mt-4 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed w-full shadow-md hover:shadow-xl transition-all transform hover:scale-[1.02]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    启动中...
                  </span>
                ) : "开始面试"}
              </button>
            </div>
          </div>
        );

      case "question":
        const { question, index } = message.data;
        return (
          <div key={message.id} className="interview-card glass-card hover-lift animate-slide-in bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200/60 rounded-2xl shadow-lg p-6 my-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-lg">{index + 1}</span>
              </div>
              <h2 className="text-xl font-semibold text-stone-800">
                面试问题 {index + 1}
              </h2>
            </div>
            <p className="text-base text-stone-700 mb-6 leading-relaxed font-medium">
              {question.question_text || ""}
            </p>

            <div className="tips glass-card bg-amber-50/80 rounded-xl p-5 border border-amber-200/60">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-amber-600 text-lg">💡</span>
                <h3 className="text-sm font-semibold text-stone-800">面试官提示</h3>
              </div>
              <ul className="space-y-3 text-sm text-stone-700">
                <li className="flex gap-2">
                  <span className="font-medium text-amber-600 flex-shrink-0">考察意图：</span>
                  <span>{parseMarkdownBold(question.tips.intent)}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-amber-600 flex-shrink-0">关键点：</span>
                  <span>{parseMarkdownBold(question.tips.keyPoints.join("、"))}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-amber-600 flex-shrink-0">结构化建议：</span>
                  <span>{parseMarkdownBold(question.tips.framework)}</span>
                </li>
                {question.tips.pitfalls && question.tips.pitfalls.length > 0 && (
                  <li className="flex gap-2">
                    <span className="font-medium text-red-500 flex-shrink-0">常见踩坑：</span>
                    <span>{parseMarkdownBold(question.tips.pitfalls.join("、"))}</span>
                  </li>
                )}
                {question.tips.proTips && question.tips.proTips.length > 0 && (
                  <li className="flex gap-2">
                    <span className="font-medium text-green-600 flex-shrink-0">专业建议：</span>
                    <span>{parseMarkdownBold(question.tips.proTips.join("、"))}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        );

      case "user":
        return (
          <div key={message.id} className="my-4">
            <MessageBubble
              content={message.data.content}
              isUser={true}
              timestamp={message.timestamp}
            />
          </div>
        );

      case "choice":
        const { questionId, questionIndex } = message.data;
        return (
          <div key={message.id} className="my-4 flex justify-center animate-scale-in">
            <div className="glass-card bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/60 rounded-2xl shadow-lg p-5 max-w-md">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-amber-600 text-xl">🤔</span>
                <h3 className="text-base font-semibold text-stone-800">接下来...</h3>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleRetryAnswer(message.id)}
                  className="flex-1 px-4 py-3 bg-white border-2 border-blue-300 text-blue-700 font-medium rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all shadow-sm hover:shadow-md transform hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>重新回答</span>
                  </div>
                </button>
                <button
                  onClick={() => handleNextQuestion(message.id)}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-xl transform hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>下一个</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );

      case "assessment":
        const { assessment } = message.data;
        return (
          <div key={message.id} className="interview-card animate-scale-in bg-white rounded-2xl shadow-lg border border-stone-200/60 p-6 my-4 overflow-hidden">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Inter', sans-serif" }}>回答评估</h2>
                <p className="text-xs text-stone-400">AI 导师点评</p>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1 mb-6 pl-1">
              <span className="text-4xl font-black bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent" style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}>
                {assessment.score}
              </span>
              <span className="text-sm text-stone-400 font-medium">/ 100</span>
            </div>

            <div className="space-y-3">
              {assessment.dimensions?.map((dim: any, idx: number) => (
                <div key={idx} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-stone-700" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Inter', sans-serif" }}>{dim.name}</span>
                    {dim.score !== undefined && (
                      <span className="text-sm font-bold text-orange-600" style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}>
                        {dim.score}
                      </span>
                    )}
                  </div>
                  {dim.score !== undefined && (
                    <div className="w-full h-1.5 bg-stone-200 rounded-full mb-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-700"
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                  )}
                  <p className="text-sm text-stone-600 leading-relaxed" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>{parseMarkdownBold(dim.comment)}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-stone-100">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <h3 className="text-sm font-semibold text-stone-700">总结</h3>
              </div>
              <p className="text-sm text-stone-600 leading-relaxed" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>{parseMarkdownBold(assessment.summary)}</p>
            </div>
          </div>
        );

      case "summary":
        const { summary } = message.data;
        const overallScore = summary.overallScore || summary.score || 0;
        const strengths = summary.strengths || [];
        const weaknesses = summary.weaknesses || summary.improvements || [];
        const suggestions = summary.suggestions || summary.recommendations || [];
        const summaryText = summary.summary || summary.overall || "";
        
        return (
          <div key={message.id} className="interview-card bg-white rounded-2xl shadow-lg border border-stone-200/60 p-6 my-4 overflow-hidden">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Inter', sans-serif" }}>本轮面试总结</h2>
                <p className="text-xs text-stone-400">AI 全面评估</p>
              </div>
            </div>
            
            {overallScore > 0 && (
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 mb-5 border border-orange-100 flex items-center gap-4">
                <div className="text-center">
                  <div className="text-4xl font-black bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent" style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}>
                    {overallScore}
                  </div>
                  <div className="text-xs text-orange-600 font-medium mt-0.5">综合得分</div>
                </div>
                <div className="flex-1 h-2 bg-orange-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-1000"
                    style={{ width: `${overallScore}%` }}
                  />
                </div>
              </div>
            )}
            
            {summaryText && (
              <p className="text-sm text-stone-600 leading-relaxed mb-5" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>
                {parseMarkdownBold(summaryText)}
              </p>
            )}

            <div className="space-y-4">
              {strengths.length > 0 && (
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <h3 className="text-sm font-semibold text-emerald-800">优势表现</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {strengths.map((s: string, idx: number) => (
                      <li key={idx} className="text-sm text-emerald-700 leading-relaxed flex items-start gap-2" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>
                        <span className="text-emerald-400 mt-1 shrink-0">•</span>
                        <span>{parseMarkdownBold(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {weaknesses.length > 0 && (
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-orange-800">提升空间</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {weaknesses.map((s: string, idx: number) => (
                      <li key={idx} className="text-sm text-orange-700 leading-relaxed flex items-start gap-2" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>
                        <span className="text-orange-400 mt-1 shrink-0">•</span>
                        <span>{parseMarkdownBold(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-blue-800">改进建议</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {suggestions.map((s: any, idx: number) => (
                      <li key={idx} className="text-sm text-blue-700 leading-relaxed flex items-start gap-2" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>
                        <span className="text-blue-400 mt-1 shrink-0">•</span>
                        <span>{parseMarkdownBold(typeof s === 'string' ? s : (s.title || s.detail || JSON.stringify(s)))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 鼓励语 */}
            <div className={`mt-5 p-3 rounded-xl text-center ${
              overallScore >= 80 
                ? "bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200" 
                : overallScore >= 60 
                  ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200"
                  : "bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200"
            }`}>
              <p className="text-sm font-medium text-stone-700" style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Inter', 'Noto Sans SC', sans-serif" }}>
                {overallScore >= 80
                  ? getRandomMessage("interview_excellent")
                  : overallScore >= 60
                    ? getRandomMessage("interview_good")
                    : getRandomMessage("interview_start")
                }
              </p>
            </div>

            {/* 生成战报按钮 */}
            <div className="mt-5 pt-4 border-t border-stone-100">
              <button
                onClick={() => {
                  setShareCardData({
                    overallScore,
                    roundType,
                    jd,
                    strengths,
                    weaknesses,
                    questionCount: questions.length,
                    date: new Date().toLocaleDateString('zh-CN'),
                  });
                }}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                生成面试战报
              </button>
            </div>
          </div>
        );

      case "error":
        const { message: errorMsg } = message.data;
        return (
          <div key={message.id} className="interview-card bg-red-50 border-2 border-red-200 rounded-xl shadow-lg p-6 my-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-red-500 text-xl">⚠️</span>
              <h2 className="text-xl font-semibold text-red-900">错误</h2>
            </div>
            <p className="text-sm text-red-700">{errorMsg}</p>
            <button
              onClick={() => {
                // 移除错误卡片
                setMessages((prev) => prev.filter((m) => m.id !== message.id));
              }}
              className="mt-3 text-xs text-red-600 hover:text-red-800 underline"
            >
              关闭
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="interview-start-page h-screen w-full bg-gradient-to-b from-white to-neutral-50 flex flex-col overflow-hidden">
      {/* 庆祝动画层 */}
      <Confetti isActive={showConfetti} />
      <CelebrationModal
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
        type={celebrationType}
        title={celebrationTitle}
      />
      {/* 顶部导航 - 玻璃拟态效果 */}
      <div className="glass-card bg-white/80 border-b border-neutral-200/60 px-6 py-4 flex-shrink-0 z-40 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              // 设置标记，让 /chat 页面显示阶段选择器
              localStorage.setItem("ajc_showStageSelector", "true");
              router.push("/chat");
            }}
            className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors group"
          >
            <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">返回</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md">
              <span className="text-white text-lg">💼</span>
            </div>
            <h1 className="text-xl font-semibold text-stone-800">
              模拟面试
            </h1>
          </div>
          <button
            onClick={() => setShowWhiteboard(!showWhiteboard)}
            className="hidden md:flex items-center gap-2 px-4 py-2 text-sm text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {showWhiteboard ? "收起白板" : "展开白板"}
          </button>
        </div>
      </div>

      {/* 主内容区域：两栏布局 */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden">
        {/* 左侧：主内容区（70%） - 固定高度，内部滚动 */}
        <div className="left-panel flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 消息/卡片流（可滚动） - FIX: 独立滚动区域 */}
          <div className="messages-area flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-stone-500">
                  <div className="interview-card bg-amber-50 border-2 border-amber-200 rounded-xl shadow-lg p-6 my-4">
                    <h2 className="text-xl font-semibold text-stone-800 mb-4">面试配置</h2>
                    <div className="space-y-4">
                      {/* 岗位 JD */}
                      <div>
                        <label className="text-sm font-medium text-stone-700">岗位 / JD</label>
                        <textarea
                          value={jd}
                          onChange={(e) => setJd(e.target.value)}
                          disabled={isLoading}
                          className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                          placeholder="请输入岗位 JD"
                          rows={3}
                        />
                      </div>
                      {/* 面试轮次 */}
                      <div>
                        <label className="text-sm font-medium text-stone-700">面试轮次</label>
                        <select
                          value={roundType}
                          onChange={(e) => setRoundType(e.target.value as RoundType)}
                          disabled={isLoading}
                          className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="业务面">业务面</option>
                          <option value="技术面">技术面</option>
                          <option value="项目深挖">项目深挖</option>
                          <option value="HR面">HR面</option>
                          <option value="总监面">总监面</option>
                        </select>
                      </div>
                      {/* 面试题目数量 */}
                      <div>
                        <label className="text-sm font-medium text-stone-700">题目数量</label>
                        <select
                          value={questionCount}
                          onChange={(e) => setQuestionCount(Number(e.target.value))}
                          disabled={isLoading}
                          className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value={1}>1 题</option>
                          <option value={2}>2 题</option>
                          <option value={3}>3 题</option>
                          <option value={4}>4 题</option>
                          <option value={5}>5 题</option>
                        </select>
                      </div>
                      {/* 简历关联 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-stone-700">关联简历（个性化出题）</label>
                          <button
                            type="button"
                            onClick={() => setUseResume(!useResume)}
                            disabled={!hasResume}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              useResume && hasResume
                                ? "bg-amber-500"
                                : "bg-gray-300"
                            } ${!hasResume ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                                useResume && hasResume ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                        {hasResume ? (
                          <p className="text-xs text-green-600 mt-1">
                            ✓ 已检测到简历：{resumeFilename}
                          </p>
                        ) : (
                          <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={`mt-2 border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                              isDragOver
                                ? "border-amber-400 bg-amber-50"
                                : "border-stone-300 hover:border-amber-400 hover:bg-amber-50/50"
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleResumeUpload(f);
                                e.target.value = "";
                              }}
                            />
                            {isUploadingResume ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-amber-600">上传中...</span>
                              </div>
                            ) : (
                              <>
                                <svg className="w-6 h-6 mx-auto text-stone-400 mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                <p className="text-xs text-stone-500">
                                  拖拽或点击上传简历（PDF/Word）
                                </p>
                                <p className="text-xs text-stone-400 mt-0.5">
                                  上传后可开启个性化出题
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {/* 启动按钮 */}
                      <button
                        onClick={handleStartInterview}
                        disabled={isLoading || !jd.trim() || questionCount < 1}
                        className="mt-4 px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                      >
                        {isLoading ? "启动中..." : "开始面试"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => renderMessage(msg))}
                
                {/* 智能引导建议 - 在总结后显示 */}
                {showSuggestions && interviewState === "idle" && (
                  <NextActionChips
                    suggestions={[
                      {
                        icon: "🔄",
                        label: "再来一轮",
                        description: "继续练习这个轮次，巩固面试技巧",
                        action: () => {
                          setShowSuggestions(false);
                          // 滚动到配置区域
                          const configCard = document.querySelector('.interview-card');
                          configCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      },
                      {
                        icon: "📝",
                        label: "优化简历",
                        description: "根据面试反馈优化简历内容",
                        action: () => {
                          localStorage.setItem("ajc_showStageSelector", "true");
                          router.push("/chat/resume-editor");
                        }
                      },
                      {
                        icon: "💼",
                        label: "换个轮次",
                        description: "尝试不同类型的面试场景",
                        action: () => {
                          setShowSuggestions(false);
                          // 滚动到配置区域
                          const configCard = document.querySelector('.interview-card');
                          configCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    ]}
                    onDismiss={() => setShowSuggestions(false)}
                  />
                )}
                
                {isLoading && (
                  <div className="flex justify-start my-4">
                    <div className="glass-card bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-md rounded-xl px-5 py-4 shadow-md border border-blue-200/60">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                        <span className="text-sm text-gray-600">AI 正在思考...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 底部输入区：固定在左栏底部 - FIX: 不再使用 absolute，改用 flex 布局 */}
          <div className="left-input-area flex-shrink-0 glass-card bg-white/95 backdrop-blur-md border-t border-neutral-200/60 px-6 py-4">
            <div className="bg-white rounded-2xl shadow-lg border border-neutral-200/60">
              <InputBar
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSubmitAnswer}
                isLoading={isLoading}
                disabled={interviewState !== "running" || isLoading}
              />
              {interviewState === "idle" && (
                <div className="text-xs text-stone-500 mt-2 text-center pb-4 px-4">
                  💡 面试题会根据你在其他阶段的聊天历史个性化出题，也可以在上方配置区直接上传简历
                </div>
              )}
              {interviewState === "finished" && (
                <div className="text-xs text-green-600 mt-2 text-center pb-4 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  面试已完成，总结已生成
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：白板（固定 30%，始终可见，sticky） - FIX: 使用 flex 布局固定 */}
        {showWhiteboard && (
          <aside className="right-whiteboard w-[30%] max-w-[30%] border-l border-gray-200 bg-white flex-shrink-0 hidden md:flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <WhiteboardCanvas
                data={whiteboardData}
                currentStage={FIXED_STAGE}
                onUpdate={setWhiteboardData}
              />
            </div>
          </aside>
        )}
      </div>

      {/* 面试战报分享卡片弹窗 */}
      {shareCardData && (
        <InterviewShareCard
          data={shareCardData}
          onClose={() => setShareCardData(null)}
        />
      )}
    </div>
  );
}
