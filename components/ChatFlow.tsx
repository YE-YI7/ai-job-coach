"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatFlowProps {
  messages: Message[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  userStage?: string;
  onNavigate?: (path: string) => void; // 新增：用于导航到其他页面
}

export default function ChatFlow({
  messages,
  inputValue,
  onInputChange,
  onSend,
  isLoading = false,
  userStage,
  onNavigate,
}: ChatFlowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputContainerHeight, setInputContainerHeight] = useState(0);

  // 监听输入框容器高度变化
  useEffect(() => {
    if (!inputContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setInputContainerHeight(height);
      }
    });

    resizeObserver.observe(inputContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // 生成AI追问建议 - 线上工作版本
  useEffect(() => {
    console.log("[DEBUG ChatFlow] useEffect triggered, isLoading:", isLoading, "messages.length:", messages.length);
    const shouldGenerate = !isLoading && messages.length > 0 && !messages[messages.length - 1].isUser;
    console.log("[DEBUG ChatFlow] shouldGenerate:", shouldGenerate);

    if (shouldGenerate) {
      console.log("[DEBUG ChatFlow] Starting to generate quick replies");
      setIsLoadingReplies(true);
      fetch("/api/generate-quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("[DEBUG ChatFlow] Quick replies received:", data);
          if (data.ok && Array.isArray(data.replies)) {
            setQuickReplies(data.replies);
          } else {
            setQuickReplies([]);
          }
        })
        .catch((err) => {
          console.error("Failed to generate quick replies:", err);
          setQuickReplies([]);
        })
        .finally(() => {
          console.log("[DEBUG ChatFlow] Setting isLoadingReplies = false");
          setIsLoadingReplies(false);
        });
    } else {
      setQuickReplies([]);
    }
  }, [messages, isLoading]);

  // 判断是否应该显示追问建议
  const shouldShowQuickReplies = !isLoading && !isLoadingReplies && quickReplies.length > 0;

  const handleFileUploadClick = () => {
    const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
    if (fileUpload) {
      fileUpload.click();
    }
  };

  const handleAutoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  const handleSendClick = () => {
    if (!isLoading && inputValue.trim()) {
      onSend();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && inputValue.trim()) {
        onSend();
      }
    }
  };

  return (
    <>
      <div id="chat-view" className="h-full flex flex-col max-w-3xl mx-auto animate-fade-in relative bg-transparent">
        {/* 聊天消息区域 */}
        <div 
          id="chat-messages" 
          className="flex-1 overflow-y-auto space-y-6 pr-2 no-scrollbar pt-6 bg-transparent"
          style={{ paddingBottom: `${Math.max(inputContainerHeight + 16, 112)}px` }}
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 animate-scale-in">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg">
                  <span className="text-4xl">👋</span>
                </div>
                <div className="text-gray-700 text-base font-semibold">嘿，有什么求职上的困扰？</div>
                <div className="text-gray-400 text-sm">随便聊聊就好，不用拘谨，益老师在这里陪你</div>
              </div>
            </div>
          ) : (
            <div>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  content={msg.content}
                  isUser={msg.isUser}
                  timestamp={msg.timestamp}
                />
              ))}
              {/* AI Loading 占位 */}
              {isLoading && (
                <div className="flex justify-start mb-4 animate-slide-in">
                  <div className="glass-card bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-md rounded-2xl px-5 py-4 shadow-md border border-blue-200/60">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      </div>
                      <span className="text-sm text-gray-600">益老师正在思考...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 底部输入栏 - 固定在视口底部 - 升级版 */}
      <div ref={inputContainerRef} className="fixed bottom-0 left-0 w-full md:w-[70%] px-6 py-4 z-20 bg-white/95 backdrop-blur-sm border-t border-gray-200">
        <div className="max-w-3xl mx-auto">
          {/* 追问建议 - 显示在输入框上方 */}
          {shouldShowQuickReplies && (
            <div className="mb-2 flex gap-2 flex-wrap">
              {quickReplies.map((reply, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onInputChange(reply);
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all animate-fade-in"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
          
          {/* 加载追问建议的占位 */}
          {isLoadingReplies && (
            <div className="mb-2 flex gap-2">
              <div className="px-3 py-1.5 text-sm text-gray-400 bg-gray-50 border border-gray-200 rounded-lg animate-pulse">
                生成建议中...
              </div>
            </div>
          )}
          
          <div className="glass-card bg-white border-2 border-neutral-200/60 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-2 flex items-end gap-2">
            {/* 上传按钮 */}
            <input type="file" id="file-upload" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.txt" />
            <button 
              onClick={handleFileUploadClick}
              className="w-10 h-10 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all flex items-center justify-center flex-shrink-0 mb-0.5 group"
              title="上传文件"
            >
              <svg className="w-5 h-5 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* 输入框 */}
            <textarea
              id="chat-input"
              rows={1}
              placeholder="输入你的内容…"
              value={inputValue}
              onChange={(e) => {
                onInputChange(e.target.value);
                handleAutoResize(e.target);
              }}
              onKeyPress={handleKeyPress}
              className="flex-1 bg-transparent outline-none border-none focus:ring-2 focus:ring-blue-400/30 rounded-xl py-3 px-3 text-gray-700 placeholder-gray-400 text-base resize-none max-h-48 overflow-y-auto leading-relaxed transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '44px' }}
            />

            {/* 发送按钮 */}
            <button 
              id="send-btn"
              onClick={handleSendClick}
              disabled={isLoading || !inputValue.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-xl flex-shrink-0 mb-0.5 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
              <span className="text-sm font-medium">发送</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

