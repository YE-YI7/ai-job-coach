"use client";

import StreamingText from "./StreamingText";
import { parseMarkdownBold } from "@/lib/markdown-utils";

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  timestamp?: Date;
  isStreaming?: boolean;
  onStreamComplete?: () => void;
}

export default function MessageBubble({ 
  content, 
  isUser, 
  timestamp,
  isStreaming = false,
  onStreamComplete
}: MessageBubbleProps) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-6 ${
      isUser ? "animate-slide-left" : "animate-slide-right"
    }`}>
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* AI 头像 */}
        {!isUser && (
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md ring-2 ring-blue-100">
              <img
                src={'picture.png'}
                alt="AI"
                className="w-6 h-6 rounded-lg object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    parent.innerHTML = '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>';
                  }
                }}
              />
            </div>
            {/* AI 在线状态指示器 */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full animate-pulse"></div>
          </div>
        )}
        
        {/* 消息气泡 */}
        <div className="flex flex-col gap-1.5">
          <div
            className={`rounded-2xl px-5 py-3.5 shadow-sm transition-all duration-200 ${
              isUser
                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md hover:shadow-md hover:-translate-y-0.5"
                : "bg-white text-gray-900 border border-gray-200 rounded-bl-md hover:shadow-md hover:border-gray-300"
            }`}
          >
            <div className={`text-[15px] leading-relaxed whitespace-pre-wrap ${
              isUser ? "text-white" : "text-gray-800"
            }`}>
              {isStreaming && !isUser ? (
                <StreamingText 
                  text={content} 
                  speed={30}
                  onComplete={onStreamComplete}
                />
              ) : (
                parseMarkdownBold(content)
              )}
            </div>
          </div>
          
          {/* 时间戳 */}
          {timestamp && (
            <div className={`text-xs px-2 flex items-center gap-1.5 ${
              isUser ? "justify-end text-gray-500" : "justify-start text-gray-400"
            }`}>
              <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
        </div>

        {/* 用户头像 */}
        {isUser && (
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md ring-2 ring-orange-100">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
