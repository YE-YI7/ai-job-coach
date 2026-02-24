"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PrepMilestone {
  day: string;
  title: string;
  tasks: string[];
  priority: "high" | "medium" | "low";
}

interface PrepPlan {
  milestones: PrepMilestone[];
  keyTips: string[];
  focusAreas: string[];
}

interface CalendarItem {
  id: string;
  company: string;
  position: string;
  interview_date: string;
  prep_plan: PrepPlan;
  created_at: string;
}

interface InterviewCalendarProps {
  onNavigateToInterview?: () => void;
}

export default function InterviewCalendar({ onNavigateToInterview }: InterviewCalendarProps) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 表单状态
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [interviewDate, setInterviewDate] = useState("");

  useEffect(() => {
    fetchCalendar();
  }, []);

  const fetchCalendar = async () => {
    try {
      const res = await fetch("/api/calendar/list");
      const data = await res.json();
      if (data.ok) {
        setItems(data.data || []);
      }
    } catch (err) {
      console.error("获取面试日历失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!company.trim() || !position.trim() || !interviewDate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: company.trim(), position: position.trim(), interviewDate }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) => [...prev, data.data].sort(
          (a, b) => new Date(a.interview_date).getTime() - new Date(b.interview_date).getTime()
        ));
        setCompany("");
        setPosition("");
        setInterviewDate("");
        setShowForm(false);
        // 自动展开新创建的条目
        setExpandedId(data.data.id);
      }
    } catch (err) {
      console.error("创建面试日历失败:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar/delete?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  // 计算天数差
  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // 获取状态配色
  const getStatusStyle = (daysUntil: number) => {
    if (daysUntil < 0) return { bg: "bg-gray-100", text: "text-gray-500", badge: "bg-gray-200 text-gray-600", label: "已过期" };
    if (daysUntil === 0) return { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700", label: "今天" };
    if (daysUntil <= 3) return { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700", label: `${daysUntil}天后` };
    if (daysUntil <= 7) return { bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700", label: `${daysUntil}天后` };
    return { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", label: `${daysUntil}天后` };
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "border-l-red-400 bg-red-50/50";
      case "medium": return "border-l-amber-400 bg-amber-50/50";
      default: return "border-l-blue-400 bg-blue-50/50";
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-100 rounded-lg"></div>
          <div className="h-20 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  // 获取今天的最小日期（用于 date input）
  const minDate = new Date().toISOString().split("T")[0];

  return (
    <div className="p-4 space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <h3 className="text-sm font-semibold text-gray-800">面试日历</h3>
          {items.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
              {items.filter(i => getDaysUntil(i.interview_date) >= 0).length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg hover:shadow-md transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showForm ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
          </svg>
          {showForm ? "取消" : "添加"}
        </button>
      </div>

      {/* 新建表单 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60 space-y-3">
              <input
                type="text"
                placeholder="公司名称"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
              />
              <input
                type="text"
                placeholder="面试岗位"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
              />
              <input
                type="date"
                min={minDate}
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !company.trim() || !position.trim() || !interviewDate}
                className="w-full py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    AI 正在生成备考计划...
                  </>
                ) : "创建面试 & 生成备考计划"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 面试列表 */}
      {items.length === 0 && !showForm ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">📅</div>
          <p className="text-sm text-gray-600 font-medium">还没有面试安排？</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">越早准备越从容。添加一场面试，<br/>益老师帮你倒推备考计划 ✨</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const daysUntil = getDaysUntil(item.interview_date);
            const status = getStatusStyle(daysUntil);
            const isExpanded = expandedId === item.id;
            const plan = item.prep_plan as PrepPlan;

            return (
              <motion.div
                key={item.id}
                layout
                className={`rounded-xl border border-gray-200/60 overflow-hidden ${status.bg} transition-all`}
              >
                {/* 面试卡片头部 */}
                <div
                  className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-white/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {/* 日期徽章 */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="text-xs text-gray-500">
                      {new Date(item.interview_date).toLocaleDateString("zh-CN", { month: "short" })}
                    </div>
                    <div className={`text-lg font-bold ${status.text}`}>
                      {new Date(item.interview_date).getDate()}
                    </div>
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{item.company}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${status.badge}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5 truncate">{item.position}</div>
                  </div>

                  {/* 展开箭头 + 删除 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="删除"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* 展开的备考计划 */}
                <AnimatePresence>
                  {isExpanded && plan && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3.5 space-y-3">
                        {/* 里程碑时间线 */}
                        {plan.milestones && plan.milestones.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-gray-500 mb-1">备考计划</div>
                            {plan.milestones.map((m, idx) => (
                              <div
                                key={idx}
                                className={`border-l-3 border-l-[3px] rounded-lg p-2.5 ${getPriorityColor(m.priority)}`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-xs font-bold text-gray-700">{m.day}</span>
                                  <span className="text-xs font-medium text-gray-800">{m.title}</span>
                                </div>
                                <ul className="space-y-1">
                                  {m.tasks.map((task, tidx) => (
                                    <li key={tidx} className="flex items-start gap-1.5 text-xs text-gray-600">
                                      <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                                      <span>{task}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 关键提醒 */}
                        {plan.keyTips && plan.keyTips.length > 0 && (
                          <div className="bg-white/60 rounded-lg p-2.5">
                            <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                              <span>💡</span> 关键提醒
                            </div>
                            <ul className="space-y-1">
                              {plan.keyTips.map((tip, idx) => (
                                <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                  <span className="text-amber-500 shrink-0">•</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 去模拟面试按钮 */}
                        {daysUntil >= 0 && daysUntil <= 3 && onNavigateToInterview && (
                          <button
                            onClick={onNavigateToInterview}
                            className="w-full py-2 text-xs font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:shadow-md transition-all"
                          >
                            开始模拟面试
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
