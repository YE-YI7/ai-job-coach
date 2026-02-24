"use client";

import { useState, useRef, ChangeEvent, useEffect } from "react";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  onHeightChange?: (height: number) => void;
}

export default function InputBar({ value, onChange, onSend, isLoading = false, disabled = false, onHeightChange }: InputBarProps) {
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 监听输入框容器高度变化
  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        onHeightChange(height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [onHeightChange]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileNames = Array.from(files)
        .filter((file) => {
          const ext = file.name.split(".").pop()?.toLowerCase();
          return ext === "pdf" || ext === "docx";
        })
        .map((file) => file.name);
      setUploadedFiles((prev) => [...prev, ...fileNames]);
    }
    // 重置 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((name) => name !== fileName));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div ref={containerRef} className="p-4">
      {/* 已上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {uploadedFiles.map((fileName, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 rounded-lg text-xs text-blue-700 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="max-w-[150px] truncate">{fileName}</span>
              <button
                onClick={() => handleRemoveFile(fileName)}
                className="text-blue-500 hover:text-blue-700 transition-colors"
                type="button"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex items-center gap-3">
        {/* 文件上传按钮 */}
        <label className="flex items-center justify-center w-11 h-11 rounded-xl border-2 border-neutral-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all group">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
          <svg
            className="w-5 h-5 text-neutral-500 group-hover:text-blue-600 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </label>

        {/* 文本输入 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息..."
          className="flex-1 px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-neutral-50 disabled:cursor-not-allowed transition-all text-sm"
          disabled={disabled || isLoading}
        />

        {/* 发送按钮 */}
        <button
          onClick={onSend}
          disabled={disabled || isLoading || !value.trim()}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              <span>发送中</span>
            </>
          ) : (
            <>
              <span>发送</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
