"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

type OnboardingStep = 'welcome' | 'identity' | 'stage' | 'methodology';

function normalizeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) {
    return null;
  }
  return path;
}

// 各阶段方法论数据（与 MethodologyModal 一致）
const METHODOLOGY_DATA: Record<string, {
  icon: string;
  title: string;
  subtitle: string;
  methodology: string;
  keyInsight: string;
  dataPoint: string;
  steps: string[];
  gradient: string;
}> = {
  career_planning: {
    icon: "🧭",
    title: "职业定位模型",
    subtitle: "Career Positioning Model",
    methodology: "先整理你的目标、真实经历和岗位样本，再从市场需求、已有证据和长期选择三个维度校准方向。",
    keyInsight: "还没有明确岗位也可以开始；导师会先找出需要验证的方向，不替你武断下结论。",
    dataPoint: "交付：目标方向、证据缺口和下一步验证行动",
    steps: ["自我画像：挖掘你的核心竞争力和隐藏优势", "市场校准：对标真实岗位要求，找到供需甜蜜点", "路径规划：制定可落地的求职策略和时间表"],
    gradient: "from-blue-500 to-indigo-600",
  },
  project_review: {
    icon: "🔍",
    title: "STAR 深挖引擎",
    subtitle: "STAR Deep-Mining Engine",
    methodology: "围绕背景、任务、行动和结果逐层追问，把项目中的个人决策、协作边界和可验证结果拆清楚。",
    keyInsight: "不能确认的数字和职责不会写入简历；缺失证据会单独标记并向你追问。",
    dataPoint: "交付：可追溯的项目证据和面试表达版本",
    steps: ["项目锁定：识别最具面试价值的 2-3 个核心项目", "细节挖掘：按 S-T-A-R 四层结构逐步深入", "亮点提炼：量化成果 + 突出个人贡献"],
    gradient: "from-indigo-500 to-purple-600",
  },
  resume_optimization: {
    icon: "✍️",
    title: "简历诊断系统",
    subtitle: "Resume Diagnostic System",
    methodology: "按岗位要求检查证据覆盖、职责边界、结果可信度、关键词和阅读层次，再给出逐项修改依据。",
    keyInsight: "优化只改变信息顺序和表达，不编造项目、职位、结果或数据。",
    dataPoint: "交付：修改差异、证据缺口和岗位定制版",
    steps: ["全面诊断：7 维度扫描，定位核心问题", "对比优化：修改前 vs 修改后，直观展示差距", "精准打磨：逐字逐句优化，确保每一行都有价值"],
    gradient: "from-orange-500 to-rose-500",
  },
  application_strategy: {
    icon: "🎯",
    title: "投递策略矩阵",
    subtitle: "Application Strategy Matrix",
    methodology: "根据岗位价值、证据匹配度、截止时间和准备成本安排投递顺序，结果变化后重新排序。",
    keyInsight: "导师会解释为什么先做这一步；你可以标记已完成、优先级不对或补充背景。",
    dataPoint: "交付：投递判断、优先级和今日 ToDo",
    steps: ["目标分层：梦想公司 / 稳妥公司 / 保底公司", "时序规划：先保底后冲刺，积累面试手感", "动态调整：根据反馈实时优化投递方向"],
    gradient: "from-emerald-500 to-teal-600",
  },
  interview: {
    icon: "🎤",
    title: "7 维面试评估模型",
    subtitle: "7-Dimension Interview Assessment",
    methodology: "结合岗位、轮次、简历证据和公开面经生成问题，并按证据完整度、逻辑和表达给出反馈。",
    keyInsight: "评分用于定位训练重点，不代表真实面试结果，也不预测 Offer 概率。",
    dataPoint: "交付：逐题反馈、追问方向和专项训练任务",
    steps: ["能力诊断：7 维度精准评估你的面试水平", "模拟实战：还原真实面试场景，积累手感", "靶向提升：针对薄弱维度重点突破"],
    gradient: "from-cyan-500 to-blue-600",
  },
  salary_talk: {
    icon: "💰",
    title: "薪资谈判框架",
    subtitle: "Salary Negotiation Framework",
    methodology: "先核对岗位范围、总包结构、你的替代选择和可证明价值，再准备报价、追问和让步边界。",
    keyInsight: "市场薪资和公司政策需要实时核验；导师会区分事实、估计和你的个人偏好。",
    dataPoint: "交付：谈薪信息清单、报价依据和沟通脚本",
    steps: ["市场调研：掌握目标岗位的真实薪资区间", "价值锚定：用数据和成果支撑你的薪资期望", "策略谈判：灵活运用时机和话术，争取最优包裹"],
    gradient: "from-rose-500 to-pink-600",
  },
  offer: {
    icon: "⚖️",
    title: "Offer 决策模型",
    subtitle: "Offer Decision Model",
    methodology: "把总包、职责、团队、成长、稳定性和生活成本放进同一张决策表，并由你设置权重。",
    keyInsight: "AI 负责补齐信息和暴露取舍，不替你做不可逆的职业决定。",
    dataPoint: "交付：信息缺口、加权对比和决策理由",
    steps: ["信息收集：全面了解每个 Offer 的显性和隐性条件", "多维评估：薪资、成长、文化、生活的权重分配", "决策输出：给出综合评分和个性化建议"],
    gradient: "from-purple-500 to-violet-600",
  },
};

const STAGES = [
  { 
    id: 1, key: "career_planning", route: "/cockpit",
    title: "还不清楚要做什么工作",
    desc: "帮你分析个人优势，定位最适合的赛道",
    gradient: "from-blue-500 to-indigo-500",
    lightBg: "bg-blue-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 2, key: "project_review", route: "/cockpit?tab=evidence",
    title: "有项目经历，但亮点挖不出",
    desc: "深度拆解项目过程，沉淀可复用的核心能力",
    gradient: "from-indigo-500 to-violet-500",
    lightBg: "bg-indigo-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
    ),
  },
  {
    id: 3, key: "resume_optimization", route: "/cockpit?tab=resume",
    title: "已有简历，但投递没回音",
    desc: "针对岗位需求精修，让简历通过初筛",
    gradient: "from-orange-500 to-amber-500",
    lightBg: "bg-orange-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    ),
  },
  {
    id: 4, key: "application_strategy", route: "/cockpit",
    title: "缺少投递渠道，或投递盲目",
    desc: "制定精准投递计划，提高面试邀请概率",
    gradient: "from-emerald-500 to-teal-500",
    lightBg: "bg-emerald-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
      </svg>
    ),
  },
  {
    id: 5, key: "interview", route: "/cockpit?tab=interview",
    title: "不擅长应对面试",
    desc: "多方位攻克面试问题，训练成面霸",
    gradient: "from-cyan-500 to-blue-500",
    lightBg: "bg-cyan-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    ),
  },
  {
    id: 6, key: "salary_talk", route: "/cockpit",
    title: "到谈薪环节，但不了解行情",
    desc: "掌握谈判技巧与薪资水位，争取利益最大化",
    gradient: "from-rose-500 to-pink-500",
    lightBg: "bg-rose-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    id: 7, key: "offer", route: "/cockpit",
    title: "手握多个 Offer，难以抉择",
    desc: "对比公司前景与福利，做出最理性的判断",
    gradient: "from-purple-500 to-violet-500",
    lightBg: "bg-purple-50",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
      </svg>
    ),
  },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = normalizeRedirectPath(searchParams.get("redirect"));
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [identity, setIdentity] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<typeof STAGES[0] | null>(null);
  const [fadeClass, setFadeClass] = useState('animate-fadeIn');

  useAuth();

  const transition = (nextStep: OnboardingStep) => {
    setFadeClass('animate-fadeOut');
    setTimeout(() => {
      setCurrentStep(nextStep);
      setFadeClass('animate-fadeIn');
    }, 300);
  };

  const handleIdentitySelect = (id: string) => {
    setIdentity(id);
    localStorage.setItem("identity", id);
    setTimeout(() => transition('stage'), 200);
  };

  const handleStageClick = (stage: typeof STAGES[0]) => {
    setSelectedStage(stage);
    localStorage.setItem("current_stage", stage.key);
    // 进入方法论预告页
    transition('methodology');
  };

  const handleStartFromMethodology = async () => {
    if (!selectedStage || isLoading) return;
    setIsLoading(true);

    const fallbackRoute = redirectTarget || selectedStage.route;

    try {
      if (redirectTarget) {
        router.push(redirectTarget);
        return;
      }

      if (selectedStage.key === "interview") {
        router.push("/cockpit?tab=interview");
        return;
      }

      if (selectedStage.route.startsWith("/chat")) {
        try {
          const apiStageMap: Record<string, string> = {
            career_planning: "career", project_review: "review",
            resume_optimization: "resume", application_strategy: "delivery",
            salary_talk: "salary", offer: "offer",
          };
          const apiStage = apiStageMap[selectedStage.key] || selectedStage.key;
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage: apiStage,
              messages: [{ role: "user", content: "请给我这个阶段的开场白" }],
            }),
          });
          const data = await res.json();
          if (data.ok && data.result) {
            localStorage.setItem("stage_intro", data.result);
          }
        } catch { /* 静默失败 */ }
      }

      router.push(selectedStage.route);
    } catch {
      router.push(fallbackRoute);
    } finally {
      setIsLoading(false);
    }
  };

  const allSteps: OnboardingStep[] = ['welcome', 'identity', 'stage', 'methodology'];
  const stepIndex = allSteps.indexOf(currentStep);
  const methodologyData = selectedStage ? METHODOLOGY_DATA[selectedStage.key] : null;

  return (
    <>
      <style jsx global>{`
        body {
          font-family: -apple-system, 'SF Pro Display', 'Inter', 'Noto Sans SC', sans-serif;
          background: #fafaf9;
          overflow-x: hidden;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-16px); }
        }
        .animate-fadeIn { animation: fadeIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
        .animate-fadeOut { animation: fadeOut 0.3s ease forwards; }

        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(180deg, #fafaf9 0%, #f5f0eb 100%)' }}>
        {/* 顶部装饰光晕 */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(251,146,60,0.08) 0%, transparent 70%)' }} />

        {/* Progress Bar */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
          {allSteps.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`rounded-full transition-all duration-500 ${
                i < stepIndex ? 'w-2.5 h-2.5 bg-orange-400' : 
                i === stepIndex ? 'w-8 h-2.5 bg-orange-500 shadow-sm shadow-orange-200' : 
                'w-2.5 h-2.5 bg-stone-300'
              }`} />
            </div>
          ))}
        </div>

        <div className={`z-10 w-full max-w-2xl ${fadeClass}`}>

          {/* ===== Step 1: Welcome ===== */}
          {currentStep === 'welcome' && (
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              <div className="relative mb-8" style={{ animation: 'float 4s ease-in-out infinite' }}>
                <div className="absolute inset-0 rounded-3xl bg-orange-400/20" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
                <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg shadow-orange-100 relative">
                  <img src="/logo.png" alt="益职AI" className="w-full h-full object-contain" />
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-stone-800 mb-3" style={{ letterSpacing: '-0.02em' }}>
                你好，欢迎来到<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">益职AI</span>
              </h1>
              <p className="text-stone-500 text-base mb-12 max-w-sm leading-relaxed">
                你的 AI 私人求职导师<br/>全流程陪你拿到理想 Offer
              </p>

              {/* 3 Feature Cards */}
              <div className="grid grid-cols-3 gap-3 w-full mb-12">
                {[
                  {
                    title: "全流程覆盖",
                    desc: "7大求职阶段\n一站搞定",
                    icon: (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                    ),
                    gradient: "from-blue-500 to-indigo-500",
                  },
                  {
                    title: "1对1 AI导师",
                    desc: "像真人一样\n对话辅导",
                    icon: (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                    ),
                    gradient: "from-orange-500 to-amber-500",
                  },
                  {
                    title: "智能白板",
                    desc: "自动沉淀\n求职关键信息",
                    icon: (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                      </svg>
                    ),
                    gradient: "from-emerald-500 to-teal-500",
                  },
                ].map((f, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-5 text-center bg-white border border-stone-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                    style={{ animation: `staggerIn 0.5s ${i * 0.1 + 0.3}s ease forwards`, opacity: 0 }}
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} text-white flex items-center justify-center mx-auto mb-3 shadow-sm`}>
                      {f.icon}
                    </div>
                    <h3 className="font-semibold text-stone-800 text-sm mb-1">{f.title}</h3>
                    <p className="text-xs text-stone-400 leading-relaxed whitespace-pre-line">{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* AI导师形象 */}
              <div className="flex items-center gap-3 mb-8 px-6 py-4 bg-white/70 backdrop-blur-sm rounded-2xl border border-stone-100 shadow-sm" style={{ animation: 'staggerIn 0.5s 0.6s ease forwards', opacity: 0 }}>
                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md ring-2 ring-orange-100 shrink-0">
                  <img src="/picture.svg" alt="益老师" className="w-full h-full object-cover" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-stone-700">益老师</p>
                  <p className="text-xs text-stone-400">你的 AI 求职导师，全程陪伴你拿 Offer</p>
                </div>
              </div>

              <button
                onClick={() => transition('identity')}
                className="group px-12 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-2xl text-base shadow-lg shadow-orange-200/50 hover:shadow-xl hover:shadow-orange-200/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
              >
                <span className="flex items-center gap-2">
                  开始使用
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </button>
            </div>
          )}

          {/* ===== Step 2: Identity ===== */}
          {currentStep === 'identity' && (
            <div className="flex flex-col items-center">
              <h1 className="text-2xl md:text-3xl font-bold text-stone-800 mb-2 text-center" style={{ letterSpacing: '-0.02em' }}>
                选择你的身份
              </h1>
              <p className="text-stone-500 mb-10 text-center text-sm">益老师会根据你的身份定制辅导方案</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-lg">
                <button
                  onClick={() => handleIdentitySelect("在校生")}
                  className={`group rounded-2xl p-8 cursor-pointer flex flex-col items-center text-center bg-white border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    identity === "在校生" ? "border-orange-400 shadow-lg shadow-orange-100" : "border-stone-100 shadow-sm hover:border-orange-200"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mb-5 shadow-md shadow-blue-200/50 group-hover:scale-105 transition-transform">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-stone-800 mb-1.5">我是学生</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">校招 / 实习 / 第一份工作</p>
                </button>

                <button
                  onClick={() => handleIdentitySelect("社招生")}
                  className={`group rounded-2xl p-8 cursor-pointer flex flex-col items-center text-center bg-white border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    identity === "社招生" ? "border-orange-400 shadow-lg shadow-orange-100" : "border-stone-100 shadow-sm hover:border-orange-200"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center mb-5 shadow-md shadow-orange-200/50 group-hover:scale-105 transition-transform">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
                      <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-stone-800 mb-1.5">我是职场人</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">跳槽 / 转行 / 职业进阶</p>
                </button>
              </div>
            </div>
          )}

          {/* ===== Step 3: Stage Select ===== */}
          {currentStep === 'stage' && (
            <div className="flex flex-col items-center w-full">
              <h1 className="text-2xl md:text-3xl font-bold text-stone-800 mb-2 text-center" style={{ letterSpacing: '-0.02em' }}>
                你现在最大的困扰是？
              </h1>
              <p className="text-stone-500 mb-8 text-center text-sm">
                选一个最符合你当下状态的，我们立刻开始
              </p>

              <div className="flex flex-col gap-2.5 w-full max-w-lg">
                {STAGES.map((stage, index) => (
                  <button
                    key={stage.id}
                    onClick={() => handleStageClick(stage)}
                    className="group relative rounded-xl p-4 flex items-center gap-4 bg-white border border-stone-100 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-orange-200"
                    style={{ animation: `staggerIn 0.4s ${index * 0.04 + 0.1}s ease forwards`, opacity: 0 }}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stage.gradient} text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                      {stage.icon}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <h3 className="font-semibold text-stone-800 text-[15px] mb-0.5">{stage.title}</h3>
                      <p className="text-xs text-stone-400 truncate">{stage.desc}</p>
                    </div>
                    <svg className="w-4 h-4 text-stone-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===== Step 4: Methodology Preview ===== */}
          {currentStep === 'methodology' && methodologyData && selectedStage && (
            <div className="flex flex-col items-center w-full max-w-lg mx-auto">
              {/* 返回按钮 */}
              <button
                onClick={() => transition('stage')}
                className="self-start flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
                </svg>
                重新选择
              </button>

              {/* 方法论卡片 */}
              <div className="w-full bg-white rounded-2xl shadow-lg border border-stone-200/60 overflow-hidden">
                {/* 顶部渐变 header */}
                <div className={`bg-gradient-to-br ${methodologyData.gradient} px-8 pt-8 pb-6 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative">
                    <div className="text-4xl mb-3" style={{ animation: 'slideUp 0.5s 0.2s ease forwards', opacity: 0 }}>{methodologyData.icon}</div>
                    <h2 className="text-xl font-bold text-white mb-1" style={{ animation: 'slideUp 0.5s 0.3s ease forwards', opacity: 0 }}>
                      {methodologyData.title}
                    </h2>
                    <p className="text-sm text-white/70 font-medium tracking-wide" style={{ animation: 'slideUp 0.5s 0.4s ease forwards', opacity: 0 }}>
                      {methodologyData.subtitle}
                    </p>
                  </div>
                </div>

                {/* 内容区域 */}
                <div className="px-8 py-6 space-y-5">
                  {/* 方法论描述 */}
                  <p className="text-sm text-stone-600 leading-relaxed" style={{ animation: 'slideUp 0.5s 0.5s ease forwards', opacity: 0 }}>
                    {methodologyData.methodology}
                  </p>

                  {/* 关键洞察 */}
                  <div className="bg-stone-50 rounded-xl p-4 border border-stone-100" style={{ animation: 'slideUp 0.5s 0.6s ease forwards', opacity: 0 }}>
                    <div className="flex gap-3">
                      <div className="shrink-0 text-2xl text-stone-300 font-serif leading-none mt-0.5">&ldquo;</div>
                      <div>
                        <p className="text-sm text-stone-700 font-medium leading-relaxed">
                          {methodologyData.keyInsight}
                        </p>
                        <p className={`text-xs mt-2 font-semibold bg-gradient-to-r ${methodologyData.gradient} bg-clip-text text-transparent`}>
                          {methodologyData.dataPoint}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 步骤列表 */}
                  <div>
                    <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">益老师会带你</h3>
                    <div className="space-y-3">
                      {methodologyData.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3"
                          style={{ animation: `slideUp 0.5s ${0.7 + idx * 0.1}s ease forwards`, opacity: 0 }}
                        >
                          <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${methodologyData.gradient} flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}>
                            <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                          </div>
                          <p className="text-sm text-stone-600 leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 底部行动按钮 */}
                <div className="px-8 pb-6">
                  <button
                    onClick={handleStartFromMethodology}
                    disabled={isLoading}
                    className={`group w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${methodologyData.gradient} hover:shadow-lg transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2`}
                    style={{ animation: 'slideUp 0.5s 1s ease forwards', opacity: 0 }}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        正在准备...
                      </>
                    ) : (
                      <>
                        开始 {selectedStage.title.slice(0, 6)}...
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部蜿蜒路径装饰 */}
        <div className="fixed bottom-0 left-0 w-full pointer-events-none z-0 opacity-40">
          <img src="/lu.png" alt="" className="w-full h-auto object-cover" style={{ maxHeight: '120px' }} />
        </div>

        {/* Footer */}
        <div className="fixed bottom-6 text-stone-400/40 text-xs font-medium tracking-wider z-10">
          &copy; 2026 益职AI
        </div>
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <OnboardingContent />
    </Suspense>
  );
}
