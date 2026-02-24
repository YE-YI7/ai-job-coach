"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface DraggableNoteProps {
  id: string;
  title: string;
  content: string | React.ReactNode;
  color: "cyan" | "blue" | "purple" | "green" | "orange" | "yellow" | "indigo" | "emerald";
  initialPosition?: { x: number; y: number };
  onPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onClick?: () => void;
  onContentChange?: (id: string, title: string, content: string) => void;
  editable?: boolean;
}

const colorClasses = {
  cyan: "bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-300 shadow-cyan-200/50",
  blue: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 shadow-blue-200/50",
  purple: "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 shadow-purple-200/50",
  green: "bg-gradient-to-br from-green-50 to-green-100 border-green-300 shadow-green-200/50",
  orange: "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-300 shadow-orange-200/50",
  yellow: "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300 shadow-yellow-200/50",
  indigo: "bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-300 shadow-indigo-200/50",
  emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300 shadow-emerald-200/50",
};

export default function DraggableNote({
  id,
  title,
  content,
  color,
  initialPosition = { x: 0, y: 0 },
  onPositionChange,
  onClick,
  onContentChange,
  editable = false,
}: DraggableNoteProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(() => {
    // 合并标题和内容为单一文本
    const contentStr = typeof content === "string" ? content : "";
    return title && contentStr ? `${title}\n${contentStr}` : title || contentStr;
  });
  const noteRef = useRef<HTMLDivElement>(null);

  // 更新初始位置
  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition.x, initialPosition.y]);

  // 更新编辑内容
  useEffect(() => {
    const contentStr = typeof content === "string" ? content : "";
    const newText = title && contentStr ? `${title}\n${contentStr}` : title || contentStr;
    setEditText(newText);
  }, [title, content]);

  const handleDragEnd = (_event: any, info: any) => {
    const newPosition = {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    };
    setPosition(newPosition);
    setIsDragging(false);
    
    if (onPositionChange) {
      onPositionChange(id, newPosition);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (editable && onContentChange) {
      e.stopPropagation();
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (onContentChange) {
      // 分割文本：第一行为标题，其余为内容
      const lines = editText.split('\n');
      const newTitle = lines[0] || "无标题";
      const newContent = lines.slice(1).join('\n') || "";
      onContentChange(id, newTitle, newContent);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    const contentStr = typeof content === "string" ? content : "";
    const originalText = title && contentStr ? `${title}\n${contentStr}` : title || contentStr;
    setEditText(originalText);
    setIsEditing(false);
  };

  return (
    <motion.div
      ref={noteRef}
      drag={!isEditing}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      initial={{ x: position.x, y: position.y, scale: 0.8, opacity: 0 }}
      animate={{ 
        x: position.x, 
        y: position.y, 
        scale: isDragging ? 1.05 : isEditing ? 1.05 : 1,
        opacity: 1,
        rotate: isDragging ? 2 : 0,
      }}
      whileHover={{ scale: isEditing ? 1.05 : 1.02, rotate: isEditing ? 0 : 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        opacity: { duration: 0.3 }
      }}
      className={`absolute w-64 p-4 rounded-xl border-2 shadow-lg ${isEditing ? "cursor-default z-50" : "cursor-move z-10"} ${colorClasses[color]} ${
        isDragging || isEditing ? "shadow-2xl" : ""
      }`}
      style={{
        touchAction: "none",
      }}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* 便利贴顶部装饰 */}
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-3 bg-gray-200/60 rounded-full shadow-sm"></div>
      
      {isEditing ? (
        /* 编辑模式 */
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-2 py-1 text-xs text-gray-700 bg-white/80 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            placeholder="第一行为标题&#10;后续行为内容"
            rows={6}
            autoFocus
          />
          <div className="text-xs text-gray-400 mb-2">提示：第一行将作为标题</div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all"
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        /* 显示模式 */
        <>
          {/* 标题 */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              {title}
            </h3>
            {onClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            )}
          </div>
          
          {/* 内容 */}
          <div className="text-xs text-gray-700 leading-relaxed">
            {typeof content === "string" ? (
              <p className="line-clamp-4">{content}</p>
            ) : (
              content
            )}
          </div>
          
          {/* 拖拽提示或编辑提示 */}
          {!isDragging && (
            <div className="absolute bottom-2 right-2 text-gray-400">
              {editable && onContentChange ? (
                <div className="text-xs">双击编辑</div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
