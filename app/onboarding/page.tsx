"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

type OnboardingStep = 'welcome' | 'identity' | 'stage';

const STAGES = [
  { 
    id: 1, key: "career_planning", route: "/chat?stage=career",
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
    id: 2, key: "project_review", route: "/chat?stage=review",
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
    id: 3, key: "resume_optimization", route: "/chat/resume-editor",
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
    id: 4, key: "application_strategy", route: "/chat?stage=delivery",
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
    id: 5, key: "interview", route: "/interview/start",
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
    id: 6, key: "salary_talk", route: "/chat?stage=salary",
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
    id: 7, key: "offer", route: "/chat?stage=offer",
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

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [identity, setIdentity] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
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

  const handleStageClick = async (stage: typeof STAGES[0]) => {
    if (isLoading) return;
    setSelectedStage(stage.key);
    setIsLoading(true);

    try {
      localStorage.setItem("current_stage", stage.key);

      if (stage.key === "interview") {
        router.push("/interview/start");
        return;
      }

      if (stage.route.startsWith("/chat")) {
        try {
          const apiStageMap: Record<string, string> = {
            career_planning: "career", project_review: "review",
            resume_optimization: "resume", application_strategy: "delivery",
            salary_talk: "salary", offer: "offer",
          };
          const apiStage = apiStageMap[stage.key] || stage.key;
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

      router.push(stage.route);
    } catch {
      router.push(stage.route);
    } finally {
      setIsLoading(false);
    }
  };

  const stepIndex = ['welcome', 'identity', 'stage'].indexOf(currentStep);

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
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(180deg, #fafaf9 0%, #f5f0eb 100%)' }}>
        {/* 顶部装饰光晕 */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(251,146,60,0.08) 0%, transparent 70%)' }} />

        {/* Progress Bar */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
          {['welcome', 'identity', 'stage'].map((s, i) => (
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

              {/* 3 Feature Cards - 精致无 emoji 版本 */}
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
                  <img src="/picture.png" alt="益老师" className="w-full h-full object-cover" />
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
                {/* Student */}
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

                {/* Professional */}
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
                    disabled={isLoading}
                    className={`group relative rounded-xl p-4 flex items-center gap-4 bg-white border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-wait ${
                      selectedStage === stage.key ? "border-orange-400 shadow-md shadow-orange-50" : "border-stone-100 shadow-sm hover:border-orange-200"
                    }`}
                    style={{ animation: `staggerIn 0.4s ${index * 0.04 + 0.1}s ease forwards`, opacity: 0 }}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stage.gradient} text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                      {stage.icon}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <h3 className="font-semibold text-stone-800 text-[15px] mb-0.5">{stage.title}</h3>
                      <p className="text-xs text-stone-400 truncate">{stage.desc}</p>
                    </div>
                    {selectedStage === stage.key ? (
                      <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
                        {isLoading ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        )}
                      </div>
                    ) : (
                      <svg className="w-4 h-4 text-stone-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                      </svg>
                    )}
                  </button>
                ))}
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
