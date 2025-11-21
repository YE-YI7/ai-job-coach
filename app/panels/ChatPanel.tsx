"use client";

import { useEffect, useRef, useState } from "react";
import JobOverviewPanel, { JobOverviewData } from "./JobOverviewPanel";
import { WhiteboardData } from "@/components/Whiteboard";

type Message = {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
};

interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  personalTip: string;
  setPersonalTip: React.Dispatch<React.SetStateAction<string>>;
  chatSessionId: string | null;
  setChatSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  onAchieve?: (label: string) => void;
  onSessionReady?: (sessionId: string) => void;
  currentStage?: string;
  onStageChange?: (stage: string) => void;
  onBack?: () => void;
  whiteboardData?: WhiteboardData;
  onWhiteboardUpdate?: (data: WhiteboardData) => void;
}

export default function ChatPanel({ 
  messages, 
  setMessages, 
  inputValue, 
  setInputValue, 
  isLoading, 
  setIsLoading, 
  personalTip, 
  setPersonalTip, 
  chatSessionId,
  setChatSessionId,
  onAchieve, 
  onSessionReady,
  currentStage,
  onStageChange,
  onBack,
  whiteboardData,
  onWhiteboardUpdate
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [overviewData, setOverviewData] = useState<JobOverviewData>({});

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    // 只有在没有消息且没有 sessionId 时才初始化
    if (messages.length === 0 && !chatSessionId) {
      const initializeChat = async () => {
        try {
          setIsLoading(true);
          let onboarding: any = null;
          try {
            const saved = localStorage.getItem("onboarding");
            if (saved) onboarding = JSON.parse(saved);
          } catch {}
          const response = await fetch("/api/demo-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onboarding }),
          });
          const data = await response.json();
          setChatSessionId(data.sessionId);
          onSessionReady?.(data.sessionId);
          const aiMessage: Message = { id: Date.now().toString(), content: data.reply, isUser: false, timestamp: new Date() };
          setMessages([aiMessage]);
          onAchieve?.("新手入门 🌱");
          if (data.personalizationTip) setPersonalTip(data.personalizationTip);
        } finally {
          setIsLoading(false);
        }
      };
      initializeChat();
    }
  }, [messages.length, chatSessionId, setIsLoading, setMessages, onSessionReady, onAchieve, setPersonalTip, setChatSessionId]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), content: inputValue.trim(), isUser: true, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    try {
      // 获取当前的 onboarding 数据
      let onboarding: any = null;
      try {
        const saved = localStorage.getItem("onboarding");
        if (saved) onboarding = JSON.parse(saved);
      } catch {}
      
      const response = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionId, message: userMessage.content, onboarding }),
      });
      const data = await response.json();
      const aiMessage: Message = { id: (Date.now() + 1).toString(), content: data.reply, isUser: false, timestamp: new Date() };
      setMessages(prev => [...prev, aiMessage]);
      
      // 更新右侧分析数据
      if (data.analysisData) {
        setOverviewData(prev => {
          const merged = { ...prev, ...data.analysisData };
          // 合并项目数组
          if (data.analysisData.projects) {
            merged.projects = [...(prev.projects || []), ...data.analysisData.projects].slice(0, 5);
          }
          return merged;
        });
      }
      
      // 更新白板数据
      if (data.whiteboardData && onWhiteboardUpdate) {
        onWhiteboardUpdate(data.whiteboardData);
      }
    } catch (e) {
      // noop
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* 顶部返回按钮 */}
      {onBack && (
        <div className="h-16 border-b border-gray-200 bg-white flex items-center px-6 flex-shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>←</span>
            <span>返回阶段选择</span>
          </button>
          {currentStage && (
            <div className="ml-4 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">当前阶段：</span>
              <span className="text-base font-semibold text-gray-900">{currentStage}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24">
          <div className="max-w-3xl mx-auto space-y-[15.33px]">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}>
                <div className="flex items-start gap-3">
                  {!message.isUser && (
                    <div className="w-8 h-8 rounded-full bg-cyan-400 flex items-center justify-center flex-shrink-0">
                      <div className="w-4 h-4 relative">
                        <div className="w-[2.67px] h-[2.67px] left-[5.33px] top-[2.67px] absolute outline outline-[1.33px] outline-white outline-offset-[-0.67px]" />
                        <div className="w-2.5 h-2 left-[2.67px] top-[5.33px] absolute outline outline-[1.33px] outline-white outline-offset-[-0.67px]" />
                        <div className="w-[1.33px] h-0 left-[1.33px] top-[9.33px] absolute outline outline-[1.33px] outline-white outline-offset-[-0.67px]" />
                        <div className="w-[1.33px] h-0 left-[13.33px] top-[9.33px] absolute outline outline-[1.33px] outline-white outline-offset-[-0.67px]" />
                      </div>
                    </div>
                  )}
                  <div className={`px-4 pt-3 pb-[0.67px] rounded-2xl ${message.isUser ? "bg-white outline outline-[0.67px] outline-red-300/30 outline-offset-[-0.67px]" : "bg-neutral-50"}`}>
                    <div className="text-gray-900 text-base font-normal leading-6 whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>
                  {message.isUser && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-b from-red-300 to-red-300 flex items-center justify-center flex-shrink-0">
                      <div className="text-white text-base font-normal leading-6">U</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-400 flex items-center justify-center">
                    <div className="w-4 h-4 relative">
                      <div className="w-[2.67px] h-[2.67px] left-[5.33px] top-[2.67px] absolute outline outline-[1.33px] outline-white outline-offset-[-0.67px]" />
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl px-4 py-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <div className="w-full h-24 pl-6 pr-12 pt-6 bg-white border-t-[0.67px] border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex justify-center items-center">
              <div className="w-4 h-4 relative">
                <div className="w-3 h-3.5 left-[2px] top-[1.33px] absolute outline outline-[1.33px] outline-gray-600 outline-offset-[-0.67px]" />
              </div>
            </div>
            <input 
              type="text" 
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)} 
              onKeyPress={handleKeyPress} 
              placeholder="告诉我你最近的求职困惑，或者直接开始一项任务..." 
              className="flex-1 h-12 px-6 bg-neutral-50 rounded-full outline outline-[0.67px] outline-gray-200 outline-offset-[-0.67px] text-sm font-normal text-gray-400"
              disabled={isLoading} 
            />
            <button 
              onClick={sendMessage} 
              disabled={!inputValue.trim() || isLoading} 
              className="w-12 h-12 bg-cyan-400 rounded-full flex items-center justify-center disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <div className="w-4 h-4 relative">
                <div className="w-3.5 h-3.5 left-[1.33px] top-[1.33px] absolute outline outline-[1.33px] outline-gray-900 outline-offset-[-0.67px]" />
                <div className="w-2 h-2 left-[7.28px] top-[1.43px] absolute outline outline-[1.33px] outline-gray-900 outline-offset-[-0.67px]" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


