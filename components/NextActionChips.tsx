"use client";

import { motion } from "framer-motion";

interface NextActionChip {
  icon: string;
  label: string;
  description: string;
  action: () => void;
}

interface NextActionChipsProps {
  suggestions: NextActionChip[];
  onDismiss?: () => void;
}

export default function NextActionChips({ suggestions, onDismiss }: NextActionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4 }}
      className="mb-4 px-6"
    >
      <div className="glass-card bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-md border border-blue-200/60 rounded-2xl p-4 shadow-lg">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-800">接下来你可以...</h3>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 建议选项 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              onClick={suggestion.action}
              className="group glass-card bg-white/60 hover:bg-white border border-neutral-200/60 rounded-xl p-4 text-left transition-all hover:shadow-md hover:scale-[1.02]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                  <span className="text-xl">{suggestion.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {suggestion.label}
                  </h4>
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {suggestion.description}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
