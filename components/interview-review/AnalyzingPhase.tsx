"use client";

/**
 * 面试复盘 - 渐进式揭晓阶段
 *
 * 编排整个流式分析的视觉体验：
 * 1. 专家团入场（粘土小人 stagger 弹入 + 暖文案）
 * 2. 逐题直播讨论（发言者头像呼吸脉冲 + 气泡 + typing indicator）
 * 3. 评分翻牌（高分闪烁粒子）
 * 4. 终极判决（模糊→清晰 + 烟花）
 */

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageCircle, Award, AlertTriangle, CheckCircle2, Heart } from "lucide-react";
import RoleAvatarSvg from "@/components/interview-review/RoleAvatarSvg";
import type { AnalysisStreamState, RoleInfo } from "@/hooks/useAnalysisStream";
import type { DiscussionTurn, ReviewRoleId } from "@/lib/interview-review/types";
import { REVIEW_ROLES } from "@/lib/interview-review/types";
import ConfettiOverlay from "@/components/interview-review/ConfettiOverlay";

// ==================== 评级配色 ====================

const gradeColors: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  S:    { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  emoji: "🏆" },
  "A+": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", emoji: "🌟" },
  A:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", emoji: "✨" },
  "A-": { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200",   emoji: "👍" },
  "B+": { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    emoji: "👌" },
  B:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    emoji: "" },
  "B-": { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     emoji: "" },
  "C+": { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  emoji: "" },
  C:    { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  emoji: "" },
  D:    { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     emoji: "" },
};
const getGradeColor = (g: string) => gradeColors[g] || gradeColors["B"];
const isHighScore = (g: string) => ["S", "A+", "A", "A-"].includes(g);

// ==================== 鼓励文案 ====================

const ENTRANCE_TEXTS = [
  "你的复盘小队到齐啦！",
  "专家们已就位，准备好了吗？",
  "让我们一起回顾你的面试表现吧��",
];

const WAITING_TEXTS = [
  "正在召集你的专属复盘团队...",
  "专家们正在赶��的路上...",
  "马上就好，小队���在集合...",
];

/** 逐题完成后的鼓励语（根据评分档次） */
const ENCOURAGEMENTS: Record<string, string[]> = {
  high: ["太棒了！", "优秀！", "漂亮！", "厉害！"],
  mid: ["还不错！", "继续加油！", "有进步空间！"],
  low: ["别灰心！", "下次会更好！", "知道短板就是进步！"],
};
function getEncouragement(score: string) {
  const tier = ["S", "A+", "A", "A-"].includes(score) ? "high"
    : ["B+", "B"].includes(score) ? "mid" : "low";
  const arr = ENCOURAGEMENTS[tier];
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==================== Props ====================

interface AnalyzingPhaseProps {
  stream: AnalysisStreamState;
  onComplete: () => void;
}

export default function AnalyzingPhase({ stream, onComplete }: AnalyzingPhaseProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasCalledComplete = useRef(false);
  const entranceTextRef = useRef(randomPick(ENTRANCE_TEXTS));
  const waitingTextRef = useRef(randomPick(WAITING_TEXTS));

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [stream.liveTurns, stream.completedResults, stream.summary]);

  // 流完成后通知父组件
  const stableOnComplete = useCallback(onComplete, [onComplete]);
  useEffect(() => {
    if (stream.status === "complete" && !hasCalledComplete.current) {
      hasCalledComplete.current = true;
      const timer = setTimeout(stableOnComplete, 2500);
      return () => clearTimeout(timer);
    }
  }, [stream.status, stableOnComplete]);

  return (
    <div className="space-y-5 pb-8" ref={scrollRef}>
      {/* Phase 1: 专家团入场 */}
      <RoleEntrance roles={stream.rolesUsed} text={entranceTextRef.current} />

      {/* Phase 2: 逐题分析 */}
      <AnimatePresence mode="popLayout">
        {stream.completedResults.map((result, i) => (
          <CompletedQuestion key={`complete-${i}`} result={result} index={i} />
        ))}
      </AnimatePresence>

      {/* 当前正在分析的题目（直播讨论） */}
      {stream.currentQuestionIndex >= 0 &&
        stream.completedResults.length <= stream.currentQuestionIndex && (
        <LiveQuestion
          questionIndex={stream.currentQuestionIndex}
          total={stream.totalQuestions}
          turns={stream.liveTurns[stream.currentQuestionIndex] || []}
          activeSpeaker={
            (stream.liveTurns[stream.currentQuestionIndex] || []).length > 0
              ? (stream.liveTurns[stream.currentQuestionIndex].slice(-1)[0]?.role_id as ReviewRoleId)
              : undefined
          }
        />
      )}

      {/* Phase 3: 终极判决 */}
      {stream.summary && <SummaryReveal summary={stream.summary} />}

      {/* 连接状态 — 用角色装饰 */}
      {stream.status === "connecting" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 gap-4"
        >
          {/* 三个跳动的小圆球 */}
          <div className="flex gap-3">
            {["#6366f1", "#10b981", "#f97316"].map((color, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15, ease: "easeInOut" }}
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <p className="text-sm text-slate-500">{waitingTextRef.current}</p>
        </motion.div>
      )}

      {/* 错误状态 — 用 Coco 的表情 */}
      {stream.status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50/80 border border-rose-200 rounded-2xl p-5 text-center space-y-3"
        >
          <div className="flex justify-center">
            <RoleAvatarSvg roleId="coco" size={48} />
          </div>
          <p className="text-sm text-rose-700 font-medium">哎呀，分析过程遇到了问题</p>
          <p className="text-xs text-rose-500">{stream.error || "请返回重试"}</p>
        </motion.div>
      )}
    </div>
  );
}

// ==================== 子组件 ====================

/** 专家团入场动画 — 粘土小人弹入 */
function RoleEntrance({ roles, text }: { roles: RoleInfo[]; text: string }) {
  if (roles.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.5 }}
      className="bg-gradient-to-b from-white to-orange-50/30 rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      <div className="p-5 pb-5">
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-sm font-medium text-slate-600 text-center mb-5"
        >
          {text}
        </motion.p>
        <div className="flex justify-center gap-4 sm:gap-6">
          {roles.map((role, i) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 40, scale: 0.5, rotate: -10 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={{
                delay: 0.35 + i * 0.18,
                type: "spring",
                stiffness: 260,
                damping: 14,
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="relative">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2 + i * 0.3,
                    ease: "easeInOut",
                    delay: i * 0.5,
                  }}
                >
                  <RoleAvatarSvg roleId={role.id} size={48} />
                </motion.div>
                {/* 在线小绿点 — 弹出 + 呼吸 */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ delay: 0.6 + i * 0.18, type: "spring", stiffness: 400 }}
                  className="absolute -bottom-0.5 -right-0.5"
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                    className="w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white"
                  />
                </motion.div>
              </div>
              <span className="text-xs font-bold text-slate-700">{role.name}</span>
              <span className="text-[10px] text-slate-400 leading-none">{role.tag}</span>
            </motion.div>
          ))}
        </div>

        {/* 底部进度暗示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 + roles.length * 0.18 }}
          className="mt-4 flex items-center justify-center gap-1.5"
        >
          <motion.div
            animate={{ width: ["0%", "100%"] }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-0.5 bg-gradient-to-r from-orange-200 via-orange-300 to-transparent rounded-full max-w-[120px]"
          />
          <span className="text-[10px] text-slate-400">准备就绪</span>
          <motion.div
            animate={{ width: ["0%", "100%"] }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-0.5 bg-gradient-to-l from-orange-200 via-orange-300 to-transparent rounded-full max-w-[120px]"
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

/** 直播讨论：正在分析的题目 */
function LiveQuestion({
  questionIndex,
  total,
  turns,
  activeSpeaker,
}: {
  questionIndex: number;
  total: number;
  turns: DiscussionTurn[];
  activeSpeaker?: ReviewRoleId | string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-orange-100 text-[10px] font-black text-orange-600">
            {questionIndex + 1}
          </span>
          <span className="text-xs text-slate-400">/ {total}</span>
        </div>
        <span className="text-xs text-slate-500">专家们正在讨论...</span>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="ml-auto"
        >
          <MessageCircle className="w-3.5 h-3.5 text-orange-400" />
        </motion.div>
      </div>

      <div className="p-4 space-y-3">
        <AnimatePresence mode="popLayout">
          {turns.map((turn, i) => (
            <DiscussionBubble key={i} turn={turn} index={i} isLatest={i === turns.length - 1} />
          ))}
        </AnimatePresence>

        {/* Typing indicator — 带下一位发言者头像暗示 */}
        <motion.div
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          className="flex items-center gap-2 pl-1"
        >
          {activeSpeaker && activeSpeaker !== "consensus" && (
            <motion.div
              animate={{ scale: [0.9, 1, 0.9] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="opacity-40"
            >
              <RoleAvatarSvg roleId={activeSpeaker as ReviewRoleId} size={20} />
            </motion.div>
          )}
          <div className="flex gap-1">
            {[0, 1, 2].map(j => (
              <motion.div
                key={j}
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 0.7, delay: j * 0.15, ease: "easeInOut" }}
                className="w-1.5 h-1.5 rounded-full bg-slate-300"
              />
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** 单条讨论气泡 */
function DiscussionBubble({ turn, index, isLatest }: { turn: DiscussionTurn; index: number; isLatest: boolean }) {
  const isConsensus = turn.role_id === "consensus";
  const role = !isConsensus ? REVIEW_ROLES[turn.role_id as ReviewRoleId] : null;
  const roleId = turn.role_id as ReviewRoleId;

  if (isConsensus) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
        className="bg-amber-50/80 border border-amber-100 rounded-2xl p-3.5 text-center"
      >
        <p className="text-xs font-medium text-amber-700 leading-relaxed">
          <span className="inline-block mr-1">💡</span>
          {turn.content}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 200, damping: 18 }}
      className="flex gap-2.5"
    >
      <div className="flex-shrink-0 pt-0.5 relative">
        <RoleAvatarSvg roleId={roleId} size={30} />
        {/* 发言中脉冲 */}
        {isLatest && (
          <motion.div
            animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${role?.accentHex || "#94a3b8"}` }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] font-bold ${role?.colorClass || "text-slate-600"}`}>
          {turn.speaker}
        </span>
        <div className={`mt-1 px-3 py-2 rounded-2xl rounded-tl-sm text-xs text-slate-700 leading-relaxed ${role?.bubbleBgClass || "bg-slate-50"}`}>
          {turn.content}
        </div>
      </div>
    </motion.div>
  );
}

/** 已完成的题目卡片 */
function CompletedQuestion({ result, index }: { result: any; index: number }) {
  const grade = getGradeColor(result.score);
  const high = isHighScore(result.score);
  const encouragement = useRef(getEncouragement(result.score));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 18 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      <div className="p-4 flex items-center gap-3">
        {/* 评分徽章 — 翻牌动画 */}
        <motion.div
          initial={{ rotateY: 90, scale: 0.6 }}
          animate={{ rotateY: 0, scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 250, damping: 12 }}
          className={`relative flex-shrink-0 w-12 h-12 rounded-xl ${grade.bg} border ${grade.border} flex items-center justify-center`}
          style={{ perspective: 400 }}
        >
          <span className={`text-sm font-black ${grade.text}`}>{result.score}</span>
          {/* 高分微闪烁 */}
          {high && (
            <motion.div
              animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.3, 0.8] }}
              transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
              className="absolute inset-0 rounded-xl"
              style={{ boxShadow: `0 0 14px ${grade.text.includes("purple") ? "#a78bfa" : "#6ee7b7"}` }}
            />
          )}
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400">Q{index + 1}</span>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </motion.div>
            {grade.emoji && (
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, type: "spring" }}
                className="text-xs"
              >
                {grade.emoji}
              </motion.span>
            )}
            {/* 鼓励语 — 小气泡弹入 */}
            <motion.span
              initial={{ opacity: 0, x: -8, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${grade.bg} ${grade.text}`}
            >
              {encouragement.current}
            </motion.span>
          </div>
          <p className="text-sm text-slate-700 truncate mt-0.5">{result.question}</p>
        </div>
      </div>
    </motion.div>
  );
}

/** 终极判决：总结揭晓 */
function SummaryReveal({ summary }: { summary: any }) {
  const grade = getGradeColor(summary.overall_grade);
  const isHigh = ["S", "A+", "A"].includes(summary.overall_grade);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="space-y-4 relative"
    >
      {/* 高分烟花 */}
      <ConfettiOverlay active={isHigh} />

      {/* 分割线动画 */}
      <div className="relative h-px my-6">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-orange-300 to-transparent"
        />
      </div>

      {/* 总评大卡 */}
      <motion.div
        initial={{ opacity: 0, scale: 1.1, filter: "blur(16px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-400" />
        <div className="p-6 text-center space-y-4">
          {/* 总评分 — 弹入 */}
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 200, damping: 12 }}
            className={`inline-flex items-center justify-center w-18 h-18 rounded-2xl ${grade.bg} border-2 ${grade.border} relative`}
            style={{ width: 72, height: 72 }}
          >
            <span className={`text-3xl font-black ${grade.text}`}>{summary.overall_grade}</span>
            {/* 高分光环 */}
            {isHigh && (
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-2xl"
                style={{ boxShadow: `0 0 20px ${grade.text.includes("purple") ? "#c084fc" : "#6ee7b7"}` }}
              />
            )}
          </motion.div>

          {/* 一句话总结 */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="text-base font-bold text-slate-800"
          >
            {summary.one_line_summary}
          </motion.p>

          {/* 亮点 + 短板 — 卡片滑入 */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2, type: "spring", stiffness: 200 }}
              className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-100/60"
            >
              <div className="flex items-center gap-1 mb-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">最大亮点</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{summary.biggest_strength}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.4, type: "spring", stiffness: 200 }}
              className="bg-orange-50/60 rounded-xl p-3.5 border border-orange-100/60"
            >
              <div className="flex items-center gap-1 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">核心短板</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{summary.biggest_weakness}</p>
            </motion.div>
          </div>

          {/* 行动建议 — 逐条弹出 */}
          {summary.training_suggestions?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6 }}
              className="text-left space-y-2 mt-5"
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">行动建议</p>
              {summary.training_suggestions.map((s: string, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.8 + i * 0.18, type: "spring", stiffness: 200 }}
                  className="flex items-start gap-2 text-xs text-slate-600"
                >
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 text-[8px] font-bold text-orange-600 flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{s}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* 查看完整报告 — 带心跳脉冲 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5 }}
        className="flex flex-col items-center gap-2 pt-3"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="relative"
        >
          <Heart className="w-5 h-5 text-rose-400" fill="currentColor" />
          <motion.div
            animate={{ scale: [1, 2, 2], opacity: [0.3, 0, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <Heart className="w-5 h-5 text-rose-300" fill="currentColor" />
          </motion.div>
        </motion.div>
        <p className="text-xs text-slate-400">即将进入完整报告...</p>
      </motion.div>
    </motion.div>
  );
}
