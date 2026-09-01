"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserStage, StageOrder, StageNames, StageDescriptions } from "@/lib/stage";

interface StageSelectorProps {
  onSelectStage: (stage: UserStage) => void;
  currentStage?: UserStage;
  onClose?: () => void;
}

export default function StageSelector({ onSelectStage, currentStage, onClose }: StageSelectorProps) {
  const router = useRouter();
  const [completedStages, setCompletedStages] = useState<Set<UserStage>>(new Set());

  useEffect(() => {
    // 从 localStorage 读取已完成的阶段
    // 判断标准：如果该阶段有聊天记录或白板数据，则认为已完成
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      
      const completed = new Set<UserStage>();
      
      // 检查白板数据
      if (whiteboardDataStr) {
        const whiteboardData = JSON.parse(whiteboardDataStr);
        
        // 根据白板数据判断哪些阶段已完成
        if (whiteboardData.intentRole || whiteboardData.keySkills?.length > 0) {
          completed.add("career_planning");
        }
        if (whiteboardData.starProjects?.length > 0) {
          completed.add("project_review");
        }
        if (whiteboardData.resumeInsights?.length > 0) {
          completed.add("resume_optimization");
        }
        if (whiteboardData.targetCompanies?.length > 0) {
          completed.add("application_strategy");
        }
        if (whiteboardData.interviewReports?.length > 0) {
          completed.add("interview");
        }
        if (whiteboardData.salaryStrategy) {
          completed.add("salary_talk");
        }
        if (whiteboardData.offers?.length > 0) {
          completed.add("offer");
        }
      }
      
      // 检查聊天记录
      if (chatHistoryStr) {
        const chatHistory = JSON.parse(chatHistoryStr);
        // 如果某个阶段有聊天记录，也认为已完成
        Object.keys(chatHistory).forEach((stage) => {
          if (chatHistory[stage]?.length > 0 && StageOrder.includes(stage as UserStage)) {
            completed.add(stage as UserStage);
          }
        });
      }
      
      setCompletedStages(completed);
    } catch (error) {
      console.error("读取已完成阶段失败:", error);
    }
  }, []);

  const getStageStatus = (stage: UserStage) => {
    if (currentStage === stage) {
      return "current";
    }
    if (completedStages.has(stage)) {
      return "completed";
    }
    return "pending";
  };

  const getStageIcon = (stage: UserStage) => {
    const icons: Record<UserStage, string> = {
      career_planning: "🎯",
      project_review: "📋",
      resume_optimization: "📝",
      application_strategy: "📤",
      interview: "💼",
      salary_talk: "💰",
      offer: "🎉",
    };
    return icons[stage] || "📌";
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* 顶部标题区域 */}
      <div className="flex-shrink-0 pt-6 pb-4 px-8 bg-gradient-to-r from-blue-50 to-purple-50">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            求职流程
          </h1>
          <p className="text-sm text-gray-600">选择你想要进入的阶段，继续你的求职之旅</p>
        </motion.div>
      </div>

      {/* 阶段选择区域 */}
      <div className="px-8 py-6">
        <div className="w-full flex flex-col gap-4">
          {StageOrder.map((stage, index) => {
            const status = getStageStatus(stage);
            const isCompleted = status === "completed";
            const isCurrent = status === "current";
            const isLast = index === StageOrder.length - 1;

            return (
              <div key={stage} className="relative">
                {/* 连接线 */}
                {!isLast && (
                  <div className="absolute left-[2.5rem] top-[calc(100%)] h-4 w-0.5 z-0">
                    <div className={`w-full h-full ${
                      isCompleted ? "bg-gradient-to-b from-orange-400 to-orange-300" : "bg-gray-200"
                    }`} style={{ 
                      backgroundImage: isCompleted ? undefined : "repeating-linear-gradient(0deg, #E5E7EB, #E5E7EB 4px, transparent 4px, transparent 8px)"
                    }}></div>
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  onClick={() => onSelectStage(stage)}
                  className={`
                    relative w-full p-5 rounded-xl border-2 cursor-pointer transition-all z-10
                    hover-lift
                    ${
                      isCurrent
                        ? "border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-lg"
                        : isCompleted
                        ? "border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50 hover:border-orange-500 hover:shadow-md"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                    }
                  `}
                >
                  {/* 完成标记 */}
                  {isCompleted && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.08 + 0.2, type: "spring", stiffness: 200 }}
                      className="absolute top-4 right-4"
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center shadow-md">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </motion.div>
                  )}

                  {/* 当前阶段标记 */}
                  {isCurrent && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.08 + 0.2, type: "spring", stiffness: 200 }}
                      className="absolute top-4 right-4"
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center gap-4">
                    {/* 图标容器 */}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                      isCurrent
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                        : isCompleted
                        ? "bg-gradient-to-br from-orange-500 to-amber-500"
                        : "bg-gradient-to-br from-gray-300 to-gray-400"
                    }`}>
                      <span className="text-2xl">{getStageIcon(stage)}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {StageNames[stage]}
                        </h3>
                        <span
                          className={`
                            text-xs px-2.5 py-1 rounded-full whitespace-nowrap font-medium
                            ${
                              isCurrent
                                ? "bg-blue-100 text-blue-700"
                                : isCompleted
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-100 text-gray-600"
                            }
                          `}
                        >
                          {isCurrent
                            ? "当前"
                            : isCompleted
                            ? "完成"
                            : "待开始"}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {index + 1}/{StageOrder.length}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {StageDescriptions[stage]}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部返回按钮区域 */}
      <div className="flex-shrink-0 pb-6 px-8 pt-4 bg-gray-50 border-t border-gray-200">
        <div className="text-center">
          <button
            onClick={() => {
              if (onClose) {
                onClose();
              } else {
                router.push("/cockpit");
              }
            }}
            className="group inline-flex items-center gap-2 px-6 py-3 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium hover:bg-white rounded-xl border border-gray-200"
          >
            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回作战盘
          </button>
        </div>
      </div>
    </div>
  );
}
