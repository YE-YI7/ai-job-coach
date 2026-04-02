"use client";

import { motion, AnimatePresence } from "framer-motion";

interface StageControllerProps {
  currentStage: string;
  onBack?: () => void;
  canGoBack?: boolean;
}

export default function StageController({
  currentStage,
  onBack,
  canGoBack = false,
}: StageControllerProps) {
  return (
    <div className="w-full h-16 glass-card bg-white/95 backdrop-blur-md border-b border-neutral-200/80 flex items-center justify-between px-4 sm:px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <AnimatePresence mode="wait">
          {canGoBack && (
            <motion.button
              key="back-button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all group"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">切换阶段</span>
            </motion.button>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">当前阶段</span>
            <motion.span
              key={currentStage}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-base font-semibold text-gray-900"
            >
              {currentStage}
            </motion.span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        <span className="text-xs text-gray-500 font-medium">AI Job Coach</span>
      </div>
    </div>
  );
}

