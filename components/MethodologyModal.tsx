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
    methodology: "先整理你的目标、真实经历和岗位样本，再从市场需求、已有证据和长期选择三个维度校准方向。",
    keyInsight: "还没有明确岗位也可以开始；导师会先找出需要验证的方向，不替你武断下结论。",
    dataPoint: "交付：目标方向、证据缺口和下一步验证行动",
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
    methodology: "围绕背景、任务、行动和结果逐层追问，把项目中的个人决策、协作边界和可验证结果拆清楚。",
    keyInsight: "不能确认的数字和职责不会写入简历；缺失证据会单独标记并向你追问。",
    dataPoint: "交付：可追溯的项目证据和面试表达版本",
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
    methodology: "按岗位要求检查证据覆盖、职责边界、结果可信度、关键词和阅读层次，再给出逐项修改依据。",
    keyInsight: "优化只改变信息顺序和表达，不编造项目、职位、结果或数据。",
    dataPoint: "交付：修改差异、证据缺口和岗位定制版",
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
    methodology: "根据岗位价值、证据匹配度、截止时间和准备成本安排投递顺序，结果变化后重新排序。",
    keyInsight: "导师会解释为什么先做这一步；你可以标记已完成、优先级不对或补充背景。",
    dataPoint: "交付：投递判断、优先级和今日 ToDo",
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
    methodology: "结合岗位、轮次、简历证据和公开面经生成问题，并按证据完整度、逻辑和表达给出反馈。",
    keyInsight: "评分用于定位训练重点，不代表真实面试结果，也不预测 Offer 概率。",
    dataPoint: "交付：逐题反馈、追问方向和专项训练任务",
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
    methodology: "先核对岗位范围、总包结构、你的替代选择和可证明价值，再准备报价、追问和让步边界。",
    keyInsight: "市场薪资和公司政策需要实时核验；导师会区分事实、估计和你的个人偏好。",
    dataPoint: "交付：谈薪信息清单、报价依据和沟通脚本",
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
    methodology: "把总包、职责、团队、成长、稳定性和生活成本放进同一张决策表，并由你设置权重。",
    keyInsight: "AI 负责补齐信息和暴露取舍，不替你做不可逆的职业决定。",
    dataPoint: "交付：信息缺口、加权对比和决策理由",
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
