"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Briefcase,
  PenLine,
  Trash2,
  Send,
  User,
  Shield,
  Handshake,
} from "lucide-react";
import {
  type DiscussionTurn,
  type ResumeDiscussionStore,
  loadDiscussionStore,
  saveDiscussionStore,
  createEmptyStore,
  hashContent,
  getLastRoundSummary,
  getVisibleTurns,
  clearDiscussionStore,
} from "@/lib/resume-discussion";

interface ResumeDiscussionPanelProps {
  appliedContent: string;
}

type GenState = "idle" | "generating";

export default function ResumeDiscussionPanel({ appliedContent }: ResumeDiscussionPanelProps) {
  const [store, setStore] = useState<ResumeDiscussionStore>(createEmptyStore);
  const [genState, setGenState] = useState<GenState>("idle");
  const [userQuestion, setUserQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingSnapshotRef = useRef<string | null>(null);
  const lastTriggeredHashRef = useRef<string>("");
  const storeRef = useRef(store);
  const genStateRef = useRef<GenState>("idle");

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    genStateRef.current = genState;
  }, [genState]);

  // 从 localStorage 恢复历史
  useEffect(() => {
    const saved = loadDiscussionStore();
    if (saved) {
      // 恢复时清除可能残留的 system loading 消息
      const cleanedTurns = saved.turns.filter(
        (t) => !(t.type === "system" && (t.content.includes("正在审阅") || t.content.includes("正在讨论")))
      );
      const cleaned = { ...saved, turns: cleanedTurns };
      setStore(cleaned);
      storeRef.current = cleaned;
      if (saved.lastResumeSnapshot) {
        lastTriggeredHashRef.current = hashContent(saved.lastResumeSnapshot);
      }
    }
    setInitialized(true);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [store.turns]);

  // 触发对谈
  const triggerDiscussion = useCallback(async (resumeContent: string) => {
    if (!resumeContent || resumeContent.trim() === "") return;

    const contentHash = hashContent(resumeContent);
    if (contentHash === lastTriggeredHashRef.current) return;
    lastTriggeredHashRef.current = contentHash;

    setGenState("generating");

    const currentStore = storeRef.current;
    const isFirstTime = currentStore.turns.length === 0 || !currentStore.lastResumeSnapshot;

    // 生成唯一的 loading ID 用于精准移除
    const loadingId = `loading-${Date.now()}`;

    const newTurns = [...currentStore.turns];

    if (!isFirstTime) {
      newTurns.push({
        type: "divider",
        label: "简历已更新",
        timestamp: new Date().toISOString(),
      });
    }

    const loadingTurn: DiscussionTurn = {
      type: "system",
      content: isFirstTime ? "两位HR正在审阅你的简历..." : "两位HR正在讨论你的修改...",
      timestamp: loadingId, // 用作标识
    };
    newTurns.push(loadingTurn);

    const storeWithLoading = { ...currentStore, turns: newTurns };
    setStore(storeWithLoading);
    storeRef.current = storeWithLoading;

    try {
      const bodyData: Record<string, string> = {
        type: "discussion",
        resumeContent,
      };

      if (!isFirstTime && currentStore.lastResumeSnapshot) {
        bodyData.previousResumeContent = currentStore.lastResumeSnapshot;
        bodyData.previousDiscussionSummary = getLastRoundSummary(currentStore.turns);
      }

      const response = await fetch("/api/hr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && Array.isArray(data.conversation)) {
          const messageTurns: DiscussionTurn[] = data.conversation.map(
            (msg: { speaker: string; content: string }) => ({
              type: "message" as const,
              speaker: msg.speaker,
              content: msg.content,
              timestamp: new Date().toISOString(),
            })
          );

          // 精准移除 loading turn（通过 timestamp === loadingId）
          const turnsWithoutLoading = storeRef.current.turns.filter(
            (t) => !(t.type === "system" && t.timestamp === loadingId)
          );

          const newStore: ResumeDiscussionStore = {
            turns: [...turnsWithoutLoading, ...messageTurns],
            lastResumeSnapshot: resumeContent,
            lastDiscussionSummary: messageTurns
              .map((t) => (t.type === "message" ? `${t.speaker}：${t.content}` : ""))
              .filter(Boolean)
              .join("\n"),
            updatedAt: new Date().toISOString(),
          };
          setStore(newStore);
          storeRef.current = newStore;
          saveDiscussionStore(newStore);
        }
      } else {
        const turnsWithoutLoading = storeRef.current.turns.filter(
          (t) => !(t.type === "system" && t.timestamp === loadingId)
        );
        const errorTurn: DiscussionTurn = {
          type: "system",
          content: "对谈生成失败，请稍后重试",
          timestamp: new Date().toISOString(),
        };
        const errorStore = { ...storeRef.current, turns: [...turnsWithoutLoading, errorTurn] };
        setStore(errorStore);
        storeRef.current = errorStore;
      }
    } catch (error) {
      console.error("对谈请求失败:", error);
      const turnsWithoutLoading = storeRef.current.turns.filter(
        (t) => !(t.type === "system" && t.timestamp === loadingId)
      );
      const errorTurn: DiscussionTurn = {
        type: "system",
        content: "网络错误，请检查连接后重试",
        timestamp: new Date().toISOString(),
      };
      const errorStore = { ...storeRef.current, turns: [...turnsWithoutLoading, errorTurn] };
      setStore(errorStore);
      storeRef.current = errorStore;
    } finally {
      setGenState("idle");
    }
  }, []);

  // 生成完成后检查 pending
  useEffect(() => {
    if (genState === "idle" && pendingSnapshotRef.current) {
      const pending = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;
      triggerDiscussion(pending);
    }
  }, [genState, triggerDiscussion]);

  // 监听 appliedContent 变化 → 触发/排队
  useEffect(() => {
    if (!initialized) return;
    if (!appliedContent || appliedContent.trim() === "") return;

    if (genStateRef.current === "generating") {
      pendingSnapshotRef.current = appliedContent;
    } else {
      triggerDiscussion(appliedContent);
    }
  }, [appliedContent, initialized, triggerDiscussion]);

  // 追问
  const handleAskQuestion = async () => {
    if (!userQuestion.trim() || asking) return;
    if (!appliedContent || appliedContent.trim() === "") return;

    const question = userQuestion.trim();
    setUserQuestion("");
    setAsking(true);

    const userTurn: DiscussionTurn = {
      type: "user-question",
      content: question,
      timestamp: new Date().toISOString(),
    };
    const updatedStore = {
      ...storeRef.current,
      turns: [...storeRef.current.turns, userTurn],
    };
    setStore(updatedStore);
    storeRef.current = updatedStore;

    try {
      const recentSummary = getLastRoundSummary(storeRef.current.turns);

      const response = await fetch("/api/hr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "discussion-question",
          resumeContent: appliedContent,
          question,
          recentDiscussion: recentSummary,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && Array.isArray(data.conversation)) {
          const answerTurns: DiscussionTurn[] = data.conversation.map(
            (msg: { speaker: string; content: string }) => ({
              type: "message" as const,
              speaker: msg.speaker,
              content: msg.content,
              timestamp: new Date().toISOString(),
            })
          );
          const newStore: ResumeDiscussionStore = {
            ...storeRef.current,
            turns: [...storeRef.current.turns, ...answerTurns],
            updatedAt: new Date().toISOString(),
          };
          setStore(newStore);
          storeRef.current = newStore;
          saveDiscussionStore(newStore);
        }
      } else {
        const errorTurn: DiscussionTurn = {
          type: "system",
          content: "追问失败，请稍后重试",
          timestamp: new Date().toISOString(),
        };
        const errorStore = {
          ...storeRef.current,
          turns: [...storeRef.current.turns, errorTurn],
        };
        setStore(errorStore);
        storeRef.current = errorStore;
      }
    } catch (error) {
      console.error("追问请求失败:", error);
      const errorTurn: DiscussionTurn = {
        type: "system",
        content: "追问失败，请稍后重试",
        timestamp: new Date().toISOString(),
      };
      const errorStore = {
        ...storeRef.current,
        turns: [...storeRef.current.turns, errorTurn],
      };
      setStore(errorStore);
      storeRef.current = errorStore;
    } finally {
      setAsking(false);
    }
  };

  // 清空历史
  const handleClearHistory = () => {
    if (confirm("确定要清空所有对谈历史吗？")) {
      clearDiscussionStore();
      const empty = createEmptyStore();
      setStore(empty);
      storeRef.current = empty;
      lastTriggeredHashRef.current = "";
      // 清空后如果有内容，重新触发首次对谈
      if (appliedContent && appliedContent.trim() !== "") {
        setTimeout(() => triggerDiscussion(appliedContent), 300);
      }
    }
  };

  const visibleTurns = getVisibleTurns(store.turns);
  const hasHistory = store.turns.length > 0;

  const getSpeakerConfig = (speaker: string) => {
    switch (speaker) {
      case "李欣":
        return {
          icon: "positive" as const,
          label: "正向HR",
          bgGradient: "from-emerald-400 to-teal-500",
          bubbleClass: "bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/80",
          nameClass: "text-emerald-700",
          labelClass: "text-emerald-500",
        };
      case "王建":
        return {
          icon: "advisory" as const,
          label: "建议HR",
          bgGradient: "from-blue-400 to-indigo-500",
          bubbleClass: "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/80",
          nameClass: "text-blue-700",
          labelClass: "text-blue-500",
        };
      case "共识":
        return {
          icon: "consensus" as const,
          label: "共识总结",
          bgGradient: "from-amber-400 to-orange-500",
          bubbleClass: "bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border border-amber-200/80",
          nameClass: "text-amber-800",
          labelClass: "text-amber-600",
        };
      default:
        return {
          icon: "default" as const,
          label: "",
          bgGradient: "from-gray-400 to-gray-500",
          bubbleClass: "bg-gray-50 border border-gray-200",
          nameClass: "text-gray-700",
          labelClass: "text-gray-500",
        };
    }
  };

  const renderSpeakerIcon = (iconType: "positive" | "advisory" | "consensus" | "default", className = "w-4 h-4") => {
    switch (iconType) {
      case "positive":
        return <User className={className} />;
      case "advisory":
        return <Shield className={className} />;
      case "consensus":
        return <Handshake className={className} />;
      default:
        return <MessageSquare className={className} />;
    }
  };

  // ─── Loading 动画组件 ──────────────────────────────────
  const TypingIndicator = () => (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* 顶部栏 — 精致的磨砂感 */}
      <div className="flex-shrink-0 px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-800">HR 对谈</span>
            {genState === "generating" && (
              <motion.span
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="ml-2 text-xs text-blue-500 inline-flex items-center gap-1"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                讨论中
              </motion.span>
            )}
          </div>
        </div>
        {hasHistory && (
          <button
            onClick={handleClearHistory}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-red-50 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        )}
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {visibleTurns.length === 0 ? (
          /* 空状态 — 暖色调插画感 */
          <div className="h-full flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-[260px]"
            >
              <div className="relative mx-auto w-20 h-20 mb-5">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 rotate-6" />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 -rotate-6" />
                <div className="relative rounded-2xl bg-white shadow-sm flex items-center justify-center h-full">
                  <Briefcase className="w-8 h-8 text-indigo-500" />
                </div>
              </div>
              <p className="text-base font-medium text-gray-700 mb-1.5">等待简历内容</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                编辑简历并点击「应用」后<br />两位HR会自动开始讨论
              </p>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleTurns.map((turn, index) => {
              const key = `${turn.timestamp}-${index}`;

              /* ── 虚线分割 ── */
              if (turn.type === "divider") {
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, scaleX: 0.3 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-3 py-3 my-1"
                  >
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                    <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100/80">
                      <PenLine className="w-3 h-3" />
                      {turn.label}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                  </motion.div>
                );
              }

              /* ── 系统消息 / Loading ── */
              if (turn.type === "system") {
                const isLoading = turn.content.includes("正在审阅") || turn.content.includes("正在讨论");
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-center"
                  >
                    <div className="bg-gray-100 text-gray-500 text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5">
                      {isLoading && <TypingIndicator />}
                      <span>{turn.content}</span>
                    </div>
                  </motion.div>
                );
              }

              /* ── 用户追问 ── */
              if (turn.type === "user-question") {
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 25 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[75%]">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-md shadow-blue-500/10">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {turn.content}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              /* ── HR 消息 ── */
              const config = getSpeakerConfig(turn.speaker);
              const isConsensus = turn.speaker === "共识";

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12, x: isConsensus ? 0 : -8 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: Math.min(0.08 * (index % 8), 0.5),
                    type: "spring",
                    stiffness: 260,
                    damping: 24,
                  }}
                  className={`flex ${isConsensus ? "justify-center" : "justify-start"}`}
                >
                  {isConsensus ? (
                    /* ── 共识卡片 ── */
                    <div className="max-w-[90%] w-full">
                      <div className={`px-5 py-4 rounded-2xl shadow-sm ${config.bubbleClass} relative overflow-hidden`}>
                        {/* 装饰线 */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-300 via-orange-400 to-amber-300" />
                        <div className="flex items-center gap-2 mb-2 pt-1">
                          <span className="inline-flex items-center justify-center text-amber-700">
                            {renderSpeakerIcon(config.icon, "w-4 h-4")}
                          </span>
                          <span className={`text-xs font-semibold ${config.nameClass} tracking-wide uppercase`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                          {turn.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ── 普通 HR 消息 ── */
                    <div className="max-w-[82%] flex gap-2.5">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${config.bgGradient} flex items-center justify-center text-sm shadow-sm text-white`}>
                        {renderSpeakerIcon(config.icon, "w-4 h-4")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${config.nameClass}`}>
                            {turn.speaker}
                          </span>
                          <span className={`text-[10px] ${config.labelClass}`}>{config.label}</span>
                        </div>
                        <div className={`px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm ${config.bubbleClass}`}>
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {turn.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 底部输入区域 */}
      {hasHistory && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white/80 backdrop-blur-sm p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !asking) {
                  e.preventDefault();
                  handleAskQuestion();
                }
              }}
              placeholder="向HR提问..."
              disabled={asking || genState === "generating"}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400 text-sm transition-all"
            />
            <button
              onClick={handleAskQuestion}
              disabled={asking || !userQuestion.trim() || genState === "generating"}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-sm shadow-blue-500/20 disabled:shadow-none active:scale-[0.97] inline-flex items-center gap-1.5"
            >
              {asking ? (
                <motion.span
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ...
                </motion.span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  发送
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 ml-1">
            修改简历并应用后，HR会自动讨论变化
          </p>
        </div>
      )}
    </div>
  );
}
