"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 固定的鼓励文案池（节省 token）
const ENCOURAGEMENT_MESSAGES = {
  // 任务里程碑 - 50% 完成
  milestone_half: [
    "已经完成一半了，你的节奏很棒！💪",
    "进度过半，胜利在望！继续保持 🚀",
    "一半的任务搞定了，你比大多数人都认真！",
    "中场休息一下？不，你正势如破竹！⚡",
  ],
  // 任务里程碑 - 全部完成
  milestone_complete: [
    "🎉 全部完成！你太厉害了！准备进入下一阶段吧！",
    "💫 完美通关！每一步都扎实走过，结果一定不会差！",
    "🏆 本阶段大满贯！你的求职准备越来越充分了！",
    "✨ 任务清零！这份认真，面试官一定感受得到！",
  ],
  // 面试得分 80+
  interview_excellent: [
    "面霸认证！这个水平已经可以自信上场了 🔥",
    "80+ 的实力，大多数面试对你来说已经不是问题！",
    "太棒了！你的表达和逻辑都在线，继续保持！",
    "这次发挥非常好！面试官都要忍不住点头了 👏",
  ],
  // 面试得分 60-80
  interview_good: [
    "不错的表现！每次练习都在进步，你已经超越了大多数人 📈",
    "60+ 说明你已经有了不错的基础，再打磨几个细节就更完美了",
    "好的开始！你的潜力远不止于此，让我们一起找到提升点 💡",
    "稳步前进！比起上次，这次的表现更有层次了",
  ],
  // 面试得分 <60
  interview_start: [
    "你已经勇敢地迈出了第一步，大多数人还停留在纸上谈兵 💪",
    "第一次练习就是最难的，接下来只会越来越好！",
    "面试是需要练习的技能，你现在做的就是最重要的事情 🌱",
    "不要看分数，看你从中学到了什么。每一次练习都是成长 ✨",
  ],
  // 低谷鼓励（连续低分或长时间未使用）
  encouragement_low: [
    "我注意到最近分数有些波动，这完全正常。每个面霸都是从反复练习中成长的 💙",
    "求职是一场马拉松，不是短跑。你现在经历的每一步，都在为最终的成功铺路 🛤️",
    "别灰心，真正的高手都经历过低谷期。重要的是你还在坚持练习 🌿",
    "有时候退一步是为了跳得更远。调整一下状态，我们随时可以继续 ☀️",
  ],
  // 阶段通关
  stage_complete: [
    "🎊 恭喜通关！这个阶段的收获一定会在后面派上用场！",
    "🌟 阶段完成！你的求职画像越来越清晰了！",
    "🎯 漂亮！又解锁了一个新阶段，你的准备越来越充分了！",
    "🏅 通关成功！别忘了回顾一下这个阶段的收获",
  ],
};

type EncouragementType = keyof typeof ENCOURAGEMENT_MESSAGES;

// 随机选一条
function getRandomMessage(type: EncouragementType): string {
  const messages = ENCOURAGEMENT_MESSAGES[type];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ========== Confetti 动画 ==========
function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const colors = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#eab308"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const size = 6 + Math.random() * 6;
  const rotation = Math.random() * 360;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: "-10px",
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
        transform: `rotate(${rotation}deg)`,
      }}
      initial={{ opacity: 1, y: 0, x: 0 }}
      animate={{
        opacity: [1, 1, 0],
        y: [0, 200 + Math.random() * 300],
        x: [-30 + Math.random() * 60, -50 + Math.random() * 100],
        rotate: [rotation, rotation + 360 + Math.random() * 360],
      }}
      transition={{
        duration: 1.5 + Math.random() * 1,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

interface ConfettiProps {
  isActive: boolean;
  particleCount?: number;
}

export function Confetti({ isActive, particleCount = 50 }: ConfettiProps) {
  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {Array.from({ length: particleCount }).map((_, i) => (
        <ConfettiParticle
          key={i}
          delay={Math.random() * 0.5}
          x={Math.random() * 100}
        />
      ))}
    </div>
  );
}

// ========== 庆祝弹窗 ==========
interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: EncouragementType;
  customMessage?: string;
  title?: string;
  score?: number;
}

export function CelebrationModal({
  isOpen,
  onClose,
  type,
  customMessage,
  title,
  score,
}: CelebrationModalProps) {
  const message = customMessage || getRandomMessage(type);

  // 根据类型选择图标和颜色
  const config = {
    milestone_half: { icon: "🔥", bg: "from-orange-50 to-amber-50", border: "border-orange-200" },
    milestone_complete: { icon: "🎉", bg: "from-green-50 to-emerald-50", border: "border-green-200" },
    interview_excellent: { icon: "🏆", bg: "from-yellow-50 to-amber-50", border: "border-yellow-200" },
    interview_good: { icon: "📈", bg: "from-blue-50 to-indigo-50", border: "border-blue-200" },
    interview_start: { icon: "💪", bg: "from-purple-50 to-pink-50", border: "border-purple-200" },
    encouragement_low: { icon: "💙", bg: "from-blue-50 to-cyan-50", border: "border-blue-200" },
    stage_complete: { icon: "🌟", bg: "from-amber-50 to-yellow-50", border: "border-amber-200" },
  };

  const { icon, bg, border } = config[type] || config.milestone_complete;

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[99] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`pointer-events-auto max-w-sm mx-4 p-6 rounded-2xl bg-gradient-to-br ${bg} border ${border} shadow-2xl cursor-pointer`}
            initial={{ scale: 0.5, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={onClose}
          >
            <div className="text-center">
              <motion.div
                className="text-5xl mb-3"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                {icon}
              </motion.div>

              {title && (
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
              )}

              {score !== undefined && (
                <motion.div
                  className="text-4xl font-extrabold text-orange-500 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring" }}
                >
                  {score}
                </motion.div>
              )}

              <p className="text-sm text-slate-700 leading-relaxed">{message}</p>

              <p className="text-xs text-slate-400 mt-3">点击关闭</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ========== 低谷鼓励检测器 Hook ==========
export function useLowMomentDetector() {
  const [shouldEncourage, setShouldEncourage] = useState(false);
  const [encourageMessage, setEncourageMessage] = useState("");

  const checkLowMoment = useCallback((recentScores: number[]) => {
    if (recentScores.length < 2) return;

    // 连续两次低于 60 分
    const lastTwo = recentScores.slice(-2);
    if (lastTwo.every(s => s < 60)) {
      setEncourageMessage(getRandomMessage("encouragement_low"));
      setShouldEncourage(true);
    }

    // 分数连续下降
    if (recentScores.length >= 3) {
      const lastThree = recentScores.slice(-3);
      if (lastThree[0] > lastThree[1] && lastThree[1] > lastThree[2]) {
        setEncourageMessage(getRandomMessage("encouragement_low"));
        setShouldEncourage(true);
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    setShouldEncourage(false);
  }, []);

  return { shouldEncourage, encourageMessage, checkLowMoment, dismiss };
}

// ========== 导出工具函数 ==========
export { getRandomMessage, ENCOURAGEMENT_MESSAGES };
export type { EncouragementType };
