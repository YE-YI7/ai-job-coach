"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserStage, StageNames } from "@/lib/stage";

export interface StageTask {
  id: string;
  user_id: string;
  stage: string;
  title: string;
  description?: string;
  sort_order: number;
  is_completed: boolean;
  completed_at?: string;
  completed_by?: "user" | "ai";
}

interface TaskCardProps {
  stage: UserStage;
  messages: any[];
  onMilestone?: (completedCount: number, totalCount: number) => void;
}

export default function TaskCard({ stage, messages, onMilestone }: TaskCardProps) {
  const [tasks, setTasks] = useState<StageTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevMessageCountRef = useRef(0);
  const tasksRef = useRef<StageTask[]>([]);
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 同步 ref
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // 跳过简历和面试阶段
  const skipStages: UserStage[] = ["resume_optimization", "interview"];
  const shouldSkip = skipStages.includes(stage);

  // 加载任务
  const loadTasks = useCallback(async () => {
    if (shouldSkip) return;
    try {
      const res = await fetch(`/api/tasks?stage=${stage}`);
      if (res.ok) {
        const data = await res.json();
        const newTasks = data.tasks || [];
        const prevCompleted = tasksRef.current.filter(t => t.is_completed).length;
        setTasks(newTasks);
        
        // 检查是否有新完成的任务
        const newCompleted = newTasks.filter((t: StageTask) => t.is_completed).length;
        if (newCompleted > prevCompleted && newTasks.length > 0) {
          checkMilestone(newTasks);
        }
      } else if (res.status === 401) {
        console.warn("[TaskCard] 未登录，跳过任务加载");
      }
    } catch (e) {
      console.error("加载任务失败:", e);
    }
  }, [stage, shouldSkip]);

  // 初始加载
  useEffect(() => {
    prevMessageCountRef.current = messages.length;
    loadTasks();
  }, [loadTasks]);

  // 当有新的 AI 消息时，延迟刷新任务列表
  // 后端在每次 AI 回复后异步更新待办，这里延迟 3 秒后轮询获取结果
  useEffect(() => {
    if (shouldSkip) return;
    if (messages.length <= 0) return;
    
    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;
    
    // 只在有新 AI 消息时触发（非用户消息）
    if (newCount > prevCount) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && !lastMsg.isUser) {
        // 显示"分析中"
        setIsGenerating(true);
        
        // 清除之前的定时器
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        
        // 延迟 3 秒后刷新（给后端异步处理时间）
        reloadTimerRef.current = setTimeout(async () => {
          await loadTasks();
          setIsGenerating(false);
        }, 3000);
      }
    }
    
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, shouldSkip]);

  // 手动切换任务完成状态
  const toggleTask = async (taskId: string, currentCompleted: boolean) => {
    const newCompleted = !currentCompleted;

    // 乐观更新
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, is_completed: newCompleted, completed_by: "user" as const }
          : t
      )
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          action: "toggle",
          taskId,
          isCompleted: newCompleted,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);

        if (newCompleted) {
          checkMilestone(data.tasks);
        }
      }
    } catch (e) {
      console.error("切换任务状态失败:", e);
      loadTasks(); // 回滚
    }
  };

  // 检查里程碑
  const checkMilestone = (taskList: StageTask[]) => {
    const completed = taskList.filter(t => t.is_completed).length;
    const total = taskList.length;

    if (onMilestone) {
      onMilestone(completed, total);
    }

    // 全部完成
    if (completed === total && total > 0) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
  };

  if (shouldSkip) return null;

  const completedCount = tasks.filter(t => t.is_completed).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (tasks.length === 0 && !isGenerating) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📝</span>
          <span className="text-xs font-semibold text-indigo-600">待办规划</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          继续和益老师聊天，当她充分了解你的情况后，会自动为你规划后续步骤
        </p>
        {isGenerating && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-indigo-500">分析中...</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span className="text-xs font-semibold text-indigo-600">
            {StageNames[stage]} · 待办规划
          </span>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* 进度条 */}
      <div className="w-full h-1.5 bg-indigo-100 rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* 任务列表 */}
      <div className="space-y-2">
        <AnimatePresence>
          {tasks.map((task, idx) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-start gap-3 p-2.5 rounded-lg transition-all duration-200 cursor-pointer group ${
                task.is_completed
                  ? "bg-white/60 border border-green-200"
                  : "bg-white border border-indigo-100 hover:border-indigo-300 hover:shadow-sm"
              }`}
              onClick={() => toggleTask(task.id, task.is_completed)}
            >
              {/* Checkbox */}
              <div className="mt-0.5 shrink-0">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    task.is_completed
                      ? "bg-green-500 border-green-500"
                      : "border-indigo-300 group-hover:border-indigo-500"
                  }`}
                >
                  {task.is_completed && (
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-3 h-3 text-white"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M10 3L4.5 8.5L2 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </motion.svg>
                  )}
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium leading-snug ${
                    task.is_completed
                      ? "text-slate-400 line-through"
                      : "text-slate-800"
                  }`}
                >
                  {task.title}
                </div>
                {task.description && !task.is_completed && (
                  <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                    {task.description}
                  </div>
                )}
                {task.is_completed && task.completed_by === "ai" && (
                  <div className="text-xs text-green-500 mt-0.5 flex items-center gap-1">
                    <span>✨</span>
                    <span>对话中自动完成</span>
                  </div>
                )}
              </div>

              {/* 序号 */}
              <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                task.is_completed
                  ? "bg-green-100 text-green-600"
                  : "bg-indigo-100 text-indigo-500"
              }`}>
                {idx + 1}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 生成中提示 */}
      {isGenerating && (
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-500">
          <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span>正在分析对话，更新任务...</span>
        </div>
      )}

      {/* 全部完成庆祝 */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="mt-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 text-center"
          >
            <div className="text-2xl mb-1">🎉</div>
            <div className="text-sm font-bold text-green-700">
              太棒了！本阶段任务全部完成！
            </div>
            <div className="text-xs text-green-600 mt-1">
              可以考虑进入下一阶段了
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
