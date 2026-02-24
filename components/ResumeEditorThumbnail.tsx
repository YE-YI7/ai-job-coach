"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface ResumeEditorThumbnailProps {
  onClose?: () => void;
}

export default function ResumeEditorThumbnail({ onClose }: ResumeEditorThumbnailProps) {
  const router = useRouter();

  const handleOpen = () => {
    router.push("/chat/resume-editor");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-lg p-4 my-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📄</span>
            <h3 className="text-sm font-semibold text-gray-900">简历优化编辑器</h3>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            AI 已为您生成优化建议，点击下方按钮进入编辑器进行编辑和预览
          </p>
          <button
            onClick={handleOpen}
            className="px-4 py-2 bg-cyan-500 text-white text-sm rounded-lg hover:bg-cyan-600 transition-colors"
          >
            进入编辑器
          </button>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            ×
          </button>
        )}
      </div>
    </motion.div>
  );
}



















