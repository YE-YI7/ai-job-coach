"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseMarkdownBold } from "@/lib/markdown-utils";

type ConversationMessage = {
  role: "user" | "hr-positive" | "hr-advisory" | "system";
  name?: string;
  content: string;
  timestamp: string;
};

interface HRReviewTabProps {
  sections: Array<{ id: string; title: string; content: string }>;
  appliedContent: string; // 右侧已应用的简历内容
}

export default function HRReviewTab({ sections, appliedContent }: HRReviewTabProps) {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [userQuestion, setUserQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [originalResumeContent, setOriginalResumeContent] = useState(""); // 第一次上传的简历
  const [hasInitialReview, setHasInitialReview] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // 生成简历内容摘要（从sections）
  const getResumeContent = () => {
    return sections
      .filter((s) => s.content.trim() !== "")
      .map((s) => `【${s.title}】\n${s.content}`)
      .join("\n\n");
  };

  // 保存第一次上传的简历内容并自动加载点评（只执行一次）
  useEffect(() => {
    const currentContent = getResumeContent();
    if (!originalResumeContent && currentContent && !hasInitialReview) {
      setOriginalResumeContent(currentContent);
      console.log("保存原始简历内容并加载初始点评");
      // 直接在这里加载点评，避免多次触发
      loadInitialReviews(currentContent);
    }
  }, [sections, originalResumeContent, hasInitialReview]);

  // 加载初始点评（基于原始简历）
  const loadInitialReviews = async (resumeContent?: string) => {
    // 使用传入的内容或已保存的原始内容
    const contentToUse = resumeContent || originalResumeContent;
    
    if (!contentToUse || contentToUse.trim() === "") {
      return;
    }

    // 如果已经有初始点评，不再重复加载
    if (hasInitialReview) {
      console.log("已有初始点评，跳过加载");
      return;
    }

    // 添加系统消息
    const systemMsg: ConversationMessage = {
      role: "system",
      content: "正在为您分析简历，请稍候...",
      timestamp: new Date().toISOString(),
    };
    setConversation([systemMsg]);

    try {
      const response = await fetch("/api/hr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "initial",
          resumeContent: contentToUse,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          // 移除系统消息，添加HR点评
          setConversation([
            {
              role: "hr-positive",
              name: data.positive.name,
              content: data.positive.content,
              timestamp: new Date().toISOString(),
            },
            {
              role: "hr-advisory",
              name: data.advisory.name,
              content: data.advisory.content,
              timestamp: new Date().toISOString(),
            },
          ]);
          setHasInitialReview(true);
          console.log("初始点评加载完成");
        }
      }
    } catch (error) {
      console.error("加载HR点评失败:", error);
      setConversation([
        {
          role: "system",
          content: "抱歉，加载失败，请稍后重试",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  // 刷新点评（基于右侧应用的简历）
  const refreshReviews = async () => {
    if (!appliedContent || appliedContent.trim() === "") {
      alert("右侧预览区域为空，请先应用内容到预览区");
      return;
    }

    // 添加系统消息
    const systemMsg: ConversationMessage = {
      role: "system",
      content: "正在分析右侧应用的简历内容...",
      timestamp: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, systemMsg]);

    try {
      const response = await fetch("/api/hr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "initial",
          resumeContent: appliedContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          // 移除系统消息，添加新的HR点评
          setConversation((prev) => {
            const withoutLastSystem = prev.slice(0, -1);
            return [
              ...withoutLastSystem,
              {
                role: "hr-positive",
                name: data.positive.name,
                content: data.positive.content,
                timestamp: new Date().toISOString(),
              },
              {
                role: "hr-advisory",
                name: data.advisory.name,
                content: data.advisory.content,
                timestamp: new Date().toISOString(),
              },
            ];
          });
        }
      }
    } catch (error) {
      console.error("刷新点评失败:", error);
      // 移除系统消息，添加错误提示
      setConversation((prev) => {
        const withoutLastSystem = prev.slice(0, -1);
        return [
          ...withoutLastSystem,
          {
            role: "system",
            content: "刷新失败，请稍后重试",
            timestamp: new Date().toISOString(),
          },
        ];
      });
    }
  };

  // 提交问题（仅基于右侧应用的简历）
  const handleAskQuestion = async () => {
    if (!userQuestion.trim()) return;

    // 检查是否有应用的内容
    if (!appliedContent || appliedContent.trim() === "") {
      alert("请先将内容应用到右侧预览区，HR才能基于应用的内容回答问题");
      return;
    }

    const question = userQuestion.trim();
    setUserQuestion("");
    setAsking(true);

    // 添加用户问题到对话
    const userMsg: ConversationMessage = {
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, userMsg]);

    try {
      // 仅使用右侧应用的简历内容
      const resumeContent = appliedContent;
      
      const response = await fetch("/api/hr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "question",
          resumeContent,
          question,
          conversationHistory: conversation
            .filter((msg) => msg.role !== "system")
            .map((msg) => ({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.content,
            })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          if (data.target === "both") {
            // 两位HR都回答
            setConversation((prev) => [
              ...prev,
              {
                role: "hr-positive",
                name: data.positive.name,
                content: data.positive.content,
                timestamp: new Date().toISOString(),
              },
              {
                role: "hr-advisory",
                name: data.advisory.name,
                content: data.advisory.content,
                timestamp: new Date().toISOString(),
              },
            ]);
          } else {
            // 单个HR回答
            setConversation((prev) => [
              ...prev,
              {
                role: data.target === "positive" ? "hr-positive" : "hr-advisory",
                name: data.answer.name,
                content: data.answer.content,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
        }
      }
    } catch (error) {
      console.error("提问失败:", error);
      setConversation((prev) => [
        ...prev,
        {
          role: "system",
          content: "抱歉，提问失败，请稍后重试",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 说明提示 - 固定在顶部 */}
      <div className="flex-shrink-0 p-3 bg-blue-50 border-b border-blue-200">
        <div className="flex items-start gap-2">
          <span className="text-blue-600 text-sm">💡</span>
          <div className="flex-1">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>评价依据：</strong>初始点评基于第一次上传的简历；刷新点评和提问仅基于<strong>右侧预览区已应用的内容</strong>。
              左侧编辑区的内容需点击"应用"后才会被HR评价。所有评价记录会保留，方便对比查看。
            </p>
          </div>
        </div>
      </div>

      {/* 刷新按钮 */}
      {hasInitialReview && appliedContent && (
        <div className="flex-shrink-0 p-3 bg-white border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm text-gray-600">💼 点击刷新获取右侧简历的最新点评</span>
          <button
            onClick={refreshReviews}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-4 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            刷新点评
          </button>
        </div>
      )}

      {/* 对话区域 - 可滚动 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {conversation.length === 0 ? (
          // 空状态
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-4xl mb-3">💼</p>
              <p className="text-base mb-2">上传或编辑简历后</p>
              <p className="text-sm text-gray-400 mb-4">AI HR会给出专业点评</p>
              <button
                onClick={() => loadInitialReviews()}
                disabled={!originalResumeContent || hasInitialReview}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                获取点评
              </button>
            </div>
          </div>
        ) : (
          // 对话气泡
          conversation.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "system" ? (
                // 系统消息
                <div className="max-w-[80%] mx-auto">
                  <div className="bg-gray-200 text-gray-600 text-xs px-4 py-2 rounded-full text-center">
                    {msg.content}
                  </div>
                </div>
              ) : msg.role === "user" ? (
                // 用户消息
                <div className="max-w-[70%]">
                  <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{parseMarkdownBold(msg.content)}</p>
                  </div>
                </div>
              ) : (
                // HR消息
                <div className="max-w-[75%] flex gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-lg">
                    {msg.role === "hr-positive" ? "👩‍💼" : "👨‍💼"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700">{msg.name}</span>
                      <span className="text-xs text-gray-400">
                        {msg.role === "hr-positive" ? "正向HR" : "建议HR"}
                      </span>
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm ${
                        msg.role === "hr-positive"
                          ? "bg-green-50 border border-green-100"
                          : "bg-blue-50 border border-blue-100"
                      }`}
                    >
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {parseMarkdownBold(msg.content)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 输入区域 - 固定在底部 */}
      {hasInitialReview && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !asking && handleAskQuestion()}
              placeholder="有问题？向HR提问..."
              disabled={asking || !appliedContent}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
            />
            <button
              onClick={handleAskQuestion}
              disabled={asking || !userQuestion.trim() || !appliedContent}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {asking ? "..." : "发送"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 {appliedContent ? "AI会根据你的问题自动分配给合适的HR回答" : "请先将内容应用到右侧预览区"}
          </p>
        </div>
      )}
    </div>
  );
}
