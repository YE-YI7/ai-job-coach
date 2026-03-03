"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  Building2,
  Tag,
  ChevronDown,
  Loader2,
  Trash2,
  FileText,
  X,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";

// ===== 类型 =====
interface HistoryItem {
  id: string;
  company: string;
  round: string;
  interview_time: string;
  tags: string[];
  question_count: number;
  overall_grade: string | null;
  one_line_summary: string | null;
  created_at: string;
}

// ===== 评级颜色 =====
const gradeConfig: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  "A+": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  A: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "A-": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "B+": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  B: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "B-": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  "C+": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  C: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  D: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};
const getGrade = (g: string) => gradeConfig[g] || gradeConfig["B"];

export default function ReviewHistoryPage() {
  const router = useRouter();

  // 数据状态
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选状态
  const [showFilters, setShowFilters] = useState(false);
  const [filterCompany, setFilterCompany] = useState("");
  const [filterRound, setFilterRound] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // 排序状态
  const [sortBy, setSortBy] = useState<"recent" | "grade">("recent");

  // 搜索防抖
  const [searchInput, setSearchInput] = useState("");

  const PAGE_SIZE = 20;

  // ===== 加载数据 =====
  const fetchHistory = useCallback(async (pageNum: number, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("page_size", String(PAGE_SIZE));
      if (filterCompany) params.set("company", filterCompany);
      if (filterRound) params.set("round", filterRound);
      if (filterTag) params.set("tag", filterTag);
      if (filterStartDate) params.set("start_date", filterStartDate);
      if (filterEndDate) params.set("end_date", filterEndDate);
      params.set("sort", sortBy);

      const res = await fetch(`/api/interview-review/history?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "加载失败");

      if (append) {
        setItems(prev => [...prev, ...data.list]);
      } else {
        setItems(data.list);
      }
      setTotal(data.total);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "加载失败";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filterCompany, filterRound, filterTag, filterStartDate, filterEndDate, sortBy]);

  // 初始加载 + 筛选变化时重载
  useEffect(() => {
    setPage(1);
    fetchHistory(1);
  }, [fetchHistory]);

  // ===== 加载更多 =====
  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHistory(nextPage, true);
  };

  // ===== 应用搜索 =====
  const handleSearch = () => {
    setFilterCompany(searchInput);
  };

  // ===== 清空筛选 =====
  const clearFilters = () => {
    setFilterCompany("");
    setFilterRound("");
    setFilterTag("");
    setFilterStartDate("");
    setFilterEndDate("");
    setSearchInput("");
  };

  const hasFilters = filterCompany || filterRound || filterTag || filterStartDate || filterEndDate;

  // ===== 清空全部历史 =====
  const handleClearAll = async () => {
    if (!confirm("确定要清空所有面试复盘记录吗？此操作不可撤销。")) return;
    try {
      const res = await fetch("/api/interview-review/history", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setItems([]);
        setTotal(0);
      }
    } catch {
      // silent
    }
  };

  // ===== 格式化日期 =====
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return "刚刚";
      if (diffMin < 60) return `${diffMin}分钟前`;
      if (diffHour < 24) return `${diffHour}小时前`;
      if (diffDay < 7) return `${diffDay}天前`;
      return formatDate(dateStr);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push("/interview/review")}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">复盘历史</h1>
              <p className="text-[10px] text-slate-400 -mt-0.5">
                {total > 0 ? `共 ${total} 条记录` : "暂无记录"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors"
                title="清空所有历史"
              >
                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* 搜索 + 筛选入口 */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="搜索公司名称..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2.5 border rounded-xl text-sm transition-all flex items-center gap-1.5 ${
                showFilters || hasFilters
                  ? "bg-orange-50 border-orange-200 text-orange-600"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              筛选
              {hasFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              )}
            </button>
            <button
              onClick={() => setSortBy(sortBy === "recent" ? "grade" : "recent")}
              className={`px-3 py-2.5 border rounded-xl text-sm transition-all flex items-center gap-1.5 ${
                sortBy === "grade"
                  ? "bg-purple-50 border-purple-200 text-purple-600"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
              title={sortBy === "recent" ? "当前：最新优先" : "当前：评级排序"}
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortBy === "recent" ? "最新" : "评级"}
            </button>
          </div>

          {/* 筛选面板 */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> 轮次
                      </label>
                      <input
                        value={filterRound}
                        onChange={e => setFilterRound(e.target.value)}
                        placeholder="如：技术一面"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> 标签
                      </label>
                      <input
                        value={filterTag}
                        onChange={e => setFilterTag(e.target.value)}
                        placeholder="如：系统设计"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> 开始日期
                      </label>
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={e => setFilterStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> 结束日期
                      </label>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={e => setFilterEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all"
                      />
                    </div>
                  </div>
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> 清除筛选
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* 列表内容 */}
        {isLoading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-400">加载中...</p>
          </div>
        ) : items.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-slate-500">
                {hasFilters ? "没有匹配的记录" : "暂无复盘记录"}
              </p>
              <p className="text-xs text-slate-400">
                {hasFilters ? "试试调整筛选条件" : "完成一次面试复盘后，记录会显示在这里"}
              </p>
            </div>
            {hasFilters ? (
              <button
                onClick={clearFilters}
                className="text-sm text-orange-500 hover:text-orange-600"
              >
                清除筛选
              </button>
            ) : (
              <button
                onClick={() => router.push("/interview/review")}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm"
              >
                开始面试复盘
              </button>
            )}
          </div>
        ) : (
          /* 历史卡片列表 */
          <div className="space-y-3">
            {items.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <button
                  onClick={() => router.push(`/interview/review?id=${item.id}`)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md hover:border-slate-200 transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* 左侧信息 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* 公司 + 轮次 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {item.company || "未命名面试"}
                        </span>
                        {item.round && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-medium shrink-0">
                            {item.round}
                          </span>
                        )}
                      </div>

                      {/* 一句话总结 */}
                      {item.one_line_summary && (
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                          {item.one_line_summary}
                        </p>
                      )}

                      {/* 标签 */}
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 5).map(t => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-[9px] font-medium"
                            >
                              {t}
                            </span>
                          ))}
                          {item.tags.length > 5 && (
                            <span className="px-1.5 py-0.5 text-slate-400 text-[9px]">
                              +{item.tags.length - 5}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 底部信息 */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        {item.interview_time && (
                          <span>{formatDate(item.interview_time)}</span>
                        )}
                        <span>{item.question_count} 题</span>
                        <span>{formatRelativeTime(item.created_at)}</span>
                      </div>
                    </div>

                    {/* 右侧评级 */}
                    {item.overall_grade && (
                      <div
                        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border ${getGrade(item.overall_grade).bg} ${getGrade(item.overall_grade).text} ${getGrade(item.overall_grade).border}`}
                      >
                        {item.overall_grade}
                      </div>
                    )}
                  </div>
                </button>
              </motion.div>
            ))}

            {/* 加载更多 */}
            {items.length < total && (
              <div className="text-center pt-2 pb-4">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-2.5 rounded-xl text-sm text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 mx-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      加载更多（还有 {total - items.length} 条）
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
