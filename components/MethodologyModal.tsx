"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 各阶段方法论数据
const METHODOLOGY_DATA: Record<string, {
  icon: string;
  title: string;
  subtitle: string;
  methodology: string;
  keyInsight: string;
  dataPoint: string;
  steps: string[];
  color: string;
  gradient: string;
}> = {
  career_planning: {
    icon: "🧭",
    title: "职业定位模型",
    subtitle: "Career Positioning Model",
    methodology: "基于 2000+ 场真实面试数据和行业薪资调研，我们提炼出「三维职业定位法」——从市场需求、个人优势、长期价值三个维度交叉验证，帮你找到最优解。",
    keyInsight: "73% 的求职失败源于定位模糊——不是能力不够，而是方向不对。",
    dataPoint: "精准定位后，面试通过率平均提升 2.4 倍",
    steps: [
      "自我画像：挖掘你的核心竞争力和隐藏优势",
      "市场校准：对标真实岗位要求，找到供需甜蜜点",
      "路径规划：制定可落地的求职策略和时间表",
    ],
    color: "blue",
    gradient: "from-blue-500 to-indigo-600",
  },
  project_review: {
    icon: "🔍",
    title: "STAR 深挖引擎",
    subtitle: "STAR Deep-Mining Engine",
    methodology: "顶尖候选人和普通候选人的差距，往往不在能力，而在「表达」。我们的 STAR 深挖引擎通过 4 层递进式追问，帮你把 60 分的经历讲出 90 分的效果。",
    keyInsight: "面试官平均 6 秒判断一段项目经历的含金量——关键在于「量化指标」和「个人贡献度」。",
    dataPoint: "经过 STAR 深挖的项目描述，面试官评分平均提升 47%",
    steps: [
      "项目锁定：识别最具面试价值的 2-3 个核心项目",
      "细节挖掘：按 S-T-A-R 四层结构逐步深入",
      "亮点提炼：量化成果 + 突出个人贡献",
    ],
    color: "indigo",
    gradient: "from-indigo-500 to-purple-600",
  },
  resume_optimization: {
    icon: "✍️",
    title: "简历诊断系统",
    subtitle: "Resume Diagnostic System",
    methodology: "我们分析了 500+ 份成功入职大厂的简历，提炼出「7 维简历评估模型」——从信息密度、量化表达、关键词匹配、视觉层次等维度系统优化。",
    keyInsight: "87% 的简历在初筛就被淘汰，最常见的三个原因：缺乏量化、描述笼统、关键词缺失。",
    dataPoint: "通过系统优化的简历，面试邀约率平均提升 3.1 倍",
    steps: [
      "全面诊断：7 维度扫描，定位核心问题",
      "对比优化：修改前 vs 修改后，直观展示差距",
      "精准打磨：逐字逐句优化，确保每一行都有价值",
    ],
    color: "orange",
    gradient: "from-orange-500 to-rose-500",
  },
  application_strategy: {
    icon: "🎯",
    title: "投递策略矩阵",
    subtitle: "Application Strategy Matrix",
    methodology: "盲目海投是效率最低的求职方式。我们基于「目标-能力匹配度」和「竞争激烈度」两个维度，构建投递优先级矩阵，让每一次投递都有的放矢。",
    keyInsight: "Top 10% 的求职者平均只投递 15-20 家公司，但面试转化率高达 40%。秘诀在于精准匹配。",
    dataPoint: "使用策略矩阵后，面试邀约率提升 2.8 倍，求职周期缩短 35%",
    steps: [
      "目标分层：梦想公司 / 稳妥公司 / 保底公司",
      "时序规划：先保底后冲刺，积累面试手感",
      "动态调整：根据反馈实时优化投递方向",
    ],
    color: "emerald",
    gradient: "from-emerald-500 to-teal-600",
  },
  interview: {
    icon: "🎤",
    title: "7 维面试评估模型",
    subtitle: "7-Dimension Interview Assessment",
    methodology: "基于 2000+ 场真实面试的评分数据，我们构建了「7 维面试评估模型」——覆盖专业深度、逻辑表达、应变能力、项目理解、沟通技巧、自我认知和文化匹配。",
    keyInsight: "面试不及格的候选人中，62% 不是因为不会，而是因为「不会说」——表达方式比内容本身更重要。",
    dataPoint: "通过 3 次以上模拟面试训练，最终面试通过率提升 58%",
    steps: [
      "能力诊断：7 维度精准评估你的面试水平",
      "模拟实战：还原真实面试场景，积累手感",
      "靶向提升：针对薄弱维度重点突破",
    ],
    color: "cyan",
    gradient: "from-cyan-500 to-blue-600",
  },
  salary_talk: {
    icon: "💰",
    title: "薪资谈判框架",
    subtitle: "Salary Negotiation Framework",
    methodology: "薪资谈判不是「要价」，而是「价值呈现」。我们基于市场薪资数据和谈判心理学，构建了一套科学的谈薪框架——让你在不伤害关系的前提下，争取最优条件。",
    keyInsight: "65% 的候选人从未尝试谈薪，而尝试谈薪的人中，82% 都成功获得了加薪。不谈才是最大的损失。",
    dataPoint: "使用谈薪框架的候选人，平均薪资提升 12-18%",
    steps: [
      "市场调研：掌握目标岗位的真实薪资区间",
      "价值锚定：用数据和成果支撑你的薪资期望",
      "策略谈判：灵活运用时机和话术，争取最优包裹",
    ],
    color: "rose",
    gradient: "from-rose-500 to-pink-600",
  },
  offer: {
    icon: "⚖️",
    title: "Offer 决策模型",
    subtitle: "Offer Decision Model",
    methodology: "选 Offer 不是选薪资最高的那个，而是选「3 年后你会感谢自己」的那个。我们的多维决策模型从短期收益、成长空间、生活平衡、行业前景等维度帮你理性决策。",
    keyInsight: "入职 1 年后后悔的人中，78% 都只在「薪资」这一个维度上做了决策。",
    dataPoint: "使用决策模型的用户，入职满意度提升 41%",
    steps: [
      "信息收集：全面了解每个 Offer 的显性和隐性条件",
      "多维评估：薪资、成长、文化、生活的权重分配",
      "决策输出：给出综合评分和个性化建议",
    ],
    color: "purple",
    gradient: "from-purple-500 to-violet-600",
  },
};

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: string;
}

export function MethodologyModal({ isOpen, onClose, stage }: MethodologyModalProps) {
  const data = METHODOLOGY_DATA[stage] || METHODOLOGY_DATA.career_planning;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* 弹窗主体 */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="pointer-events-auto bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100"
            >
              {/* 顶部渐变区域 */}
              <div className={`bg-gradient-to-br ${data.gradient} px-8 pt-8 pb-6 relative overflow-hidden`}>
                {/* 装饰性背景元素 */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                
                {/* 关闭按钮 */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className="relative">
                  <div className="text-4xl mb-3">{data.icon}</div>
                  <h2 className="text-xl font-bold text-white mb-1">{data.title}</h2>
                  <p className="text-sm text-white/70 font-medium tracking-wide">{data.subtitle}</p>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="px-8 py-6 space-y-5 max-h-[50vh] overflow-y-auto">
                {/* 方法论描述 */}
                <p className="text-sm text-gray-600 leading-relaxed">
                  {data.methodology}
                </p>

                {/* 关键洞察 - 带引号样式 */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex gap-3">
                    <div className="shrink-0 text-2xl text-gray-300 font-serif leading-none mt-0.5">"</div>
                    <div>
                      <p className="text-sm text-gray-700 font-medium leading-relaxed">
                        {data.keyInsight}
                      </p>
                      <p className={`text-xs mt-2 font-semibold bg-gradient-to-r ${data.gradient} bg-clip-text text-transparent`}>
                        {data.dataPoint}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 步骤列表 */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">本阶段方法论路径</h3>
                  <div className="space-y-3">
                    {data.steps.map((step, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * (idx + 1), duration: 0.3 }}
                        className="flex items-start gap-3"
                      >
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${data.gradient} flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}>
                          <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="px-8 pb-6">
                <button
                  onClick={onClose}
                  className={`w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${data.gradient} hover:shadow-lg transition-all duration-300 active:scale-[0.98]`}
                >
                  开始这个阶段
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * 方法论入口按钮 - 放在聊天页角落
 */
interface MethodologyTriggerProps {
  stage: string;
  onClick: () => void;
}

export function MethodologyTrigger({ stage, onClick }: MethodologyTriggerProps) {
  const data = METHODOLOGY_DATA[stage] || METHODOLOGY_DATA.career_planning;

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/80 transition-all duration-300"
      title="查看本阶段方法论"
    >
      <span className="text-base">{data.icon}</span>
      <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors hidden sm:inline">
        方法论
      </span>
      <svg className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </motion.button>
  );
}

/**
 * Hook: 管理方法论弹窗的首次自动弹出逻辑
 */
export function useMethodologyModal(stage: string) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 检查当前阶段是否已经看过方法论弹窗
    const storageKey = `ajc_methodology_seen_${stage}`;
    const hasSeen = localStorage.getItem(storageKey);
    
    if (!hasSeen && stage) {
      // 延迟 800ms 后弹出，给用户一个缓冲
      const timer = setTimeout(() => {
        setIsOpen(true);
        localStorage.setItem(storageKey, "true");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, open, close };
}
