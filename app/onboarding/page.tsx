"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

type OnboardingStep = 'welcome' | 'identity' | 'stage';

// 阶段配置
const STAGES = [
  { 
    id: 1, key: "career_planning", route: "/chat?stage=career",
    title: "还不清楚要做什么工作",
    desc: "帮你分析个人优势，定位最适合的赛道。",
    color: "text-blue-500", bg: "bg-blue-50", borderColor: "border-blue-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={2}/>
        <polygon points="12 6 16 14 12 10 8 14 12 6" strokeWidth={2}/>
      </svg>
    ),
  },
  {
    id: 2, key: "project_review", route: "/chat?stage=review",
    title: "有项目经历，但亮点挖不出",
    desc: "深度拆解项目过程，沉淀可复用的核心能力。",
    color: "text-indigo-500", bg: "bg-indigo-50", borderColor: "border-indigo-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
    ),
  },
  {
    id: 3, key: "resume_optimization", route: "/chat/resume-editor",
    title: "已有简历，但投递没回音",
    desc: "针对岗位需求精修，让你的简历通过初筛。",
    color: "text-orange-500", bg: "bg-orange-50", borderColor: "border-orange-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    ),
  },
  {
    id: 4, key: "application_strategy", route: "/chat?stage=delivery",
    title: "缺少投递渠道，或投递盲目",
    desc: "制定精准投递计划，提高面试邀请的概率。",
    color: "text-emerald-500", bg: "bg-emerald-50", borderColor: "border-emerald-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
      </svg>
    ),
  },
  {
    id: 5, key: "interview", route: "/interview/start",
    title: "不擅长应对面试",
    desc: "多方位攻克面试问题，训练成\"面霸\"。",
    color: "text-cyan-500", bg: "bg-cyan-50", borderColor: "border-cyan-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    ),
  },
  {
    id: 6, key: "salary_talk", route: "/chat?stage=salary",
    title: "到谈薪环节，但不了解行情",
    desc: "掌握谈判技巧与薪资水位，争取利益最大化。",
    color: "text-rose-500", bg: "bg-rose-50", borderColor: "border-rose-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    id: 7, key: "offer", route: "/chat?stage=offer",
    title: "手握多个 Offer，难以抉择",
    desc: "对比公司前景与福利，做出最理性的判断。",
    color: "text-purple-500", bg: "bg-purple-50", borderColor: "border-purple-200",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
      </svg>
    ),
  },
];

// 产品亮点
const FEATURES = [
  { icon: "🎯", title: "7大求职阶段全覆盖", desc: "从职业规划到Offer决策" },
  { icon: "🤖", title: "AI智能对话", desc: "像真人导师一样1对1辅导" },
  { icon: "📊", title: "智能白板", desc: "自动沉淀你的求职关键信息" },
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

      // 预加载开场白
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
        } catch {}
      }

      router.push(stage.route);
    } catch {
      router.push(stage.route);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        body {
          font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
          background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 50%, #ffe4e6 100%);
          overflow-x: hidden;
        }
        .ambient-light-1 {
          position: absolute; top: -10%; right: -10%; width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(251,146,60,0.15) 0%, transparent 70%);
          border-radius: 50%; pointer-events: none; z-index: 0;
          animation: float-slow 20s infinite alternate;
        }
        .ambient-light-2 {
          position: absolute; bottom: -10%; left: -10%; width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(251,113,133,0.1) 0%, transparent 70%);
          border-radius: 50%; pointer-events: none; z-index: 0;
          animation: float-slow 15s infinite alternate-reverse;
        }
        @keyframes float-slow {
          0% { transform: translate(0,0); }
          100% { transform: translate(30px,30px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-12px); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
        .animate-fadeOut { animation: fadeOut 0.3s ease forwards; }

        .glass-card {
          background: rgba(255,255,255,0.25);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.6);
          box-shadow: 0 20px 50px -12px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.5);
        }
        .identity-card {
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
          background: rgba(255,255,255,0.4); backdrop-filter: blur(20px);
          border: 2px solid rgba(255,255,255,0.6);
          box-shadow: 0 8px 30px -8px rgba(0,0,0,0.08);
        }
        .identity-card:hover { transform: translateY(-6px) scale(1.02); border-color: #f97316; box-shadow: 0 16px 40px -12px rgba(249,115,22,0.15); }
        .identity-card.selected { border-color: #f97316; background: rgba(255,255,255,0.9); }

        .stage-card {
          background: rgba(255,255,255,0.85); border-radius: 14px;
          border: 1.5px solid transparent; transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 2px 8px -2px rgba(0,0,0,0.06);
        }
        .stage-card:hover:not(:disabled) { transform: translateY(-4px); border-color: #f97316; box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1); }
        .stage-card.selected { border-color: #f97316; background: #fff; }
        .stage-card:disabled { opacity: 0.6; cursor: not-allowed; }

        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-slate-800 relative">
        <div className="ambient-light-1" />
        <div className="ambient-light-2" />

        {/* Progress indicator */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {['welcome', 'identity', 'stage'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                currentStep === s ? 'w-6 bg-orange-500' : 
                ['welcome','identity','stage'].indexOf(currentStep) > i ? 'bg-orange-400' : 'bg-slate-300'
              }`} />
            </div>
          ))}
        </div>

        <div className={`z-10 w-full max-w-3xl ${fadeClass}`}>
          {/* Step 1: Welcome - 产品价值展示 */}
          {currentStep === 'welcome' && (
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 mb-6">
                <img src="/logo.png" alt="益职AI" className="w-full h-full object-contain rounded-2xl" />
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-3 tracking-tight">
                欢迎来到益职 AI
              </h1>
              <p className="text-slate-500 text-lg mb-10 max-w-md">
                你的AI私人求职导师，全流程陪你拿到理想offer
              </p>

              {/* Feature cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10">
                {FEATURES.map((f, i) => (
                  <div
                    key={i}
                    className="glass-card rounded-2xl p-5 text-center"
                    style={{ animation: `staggerIn 0.6s ${i * 0.1 + 0.2}s ease forwards`, opacity: 0 }}
                  >
                    <div className="text-3xl mb-3">{f.icon}</div>
                    <h3 className="font-bold text-slate-800 text-sm mb-1">{f.title}</h3>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => transition('identity')}
                className="px-10 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-2xl text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                开始使用
              </button>
            </div>
          )}

          {/* Step 2: Identity Select */}
          {currentStep === 'identity' && (
            <div className="flex flex-col items-center">
              <h1 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight text-center">
                选择你的身份
              </h1>
              <p className="text-slate-500 mb-10 text-center">让我们为你量身定制求职方案</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                {/* Student */}
                <button
                  onClick={() => handleIdentitySelect("在校生")}
                  className={`identity-card rounded-2xl p-8 cursor-pointer flex flex-col items-center text-center ${identity === "在校生" ? "selected" : ""}`}
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center mb-5 border border-blue-100">
                    <svg className="w-10 h-10 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">我是学生</h3>
                  <p className="text-sm text-slate-500">正在探索职业道路，寻找第一份实习或工作</p>
                </button>

                {/* Professional */}
                <button
                  onClick={() => handleIdentitySelect("社招生")}
                  className={`identity-card rounded-2xl p-8 cursor-pointer flex flex-col items-center text-center ${identity === "社招生" ? "selected" : ""}`}
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center mb-5 border border-amber-100">
                    <svg className="w-10 h-10 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
                      <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">我是职场人</h3>
                  <p className="text-sm text-slate-500">希望职业进阶、跳槽或转行，寻求新机会</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Stage Select */}
          {currentStep === 'stage' && (
            <div className="flex flex-col items-center w-full">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2 tracking-tight text-center">
                你现在最大的求职困扰是什么？
              </h1>
              <p className="text-slate-500 mb-8 text-center text-sm">
                选择一个最符合你当下状态的问题，我们立刻开始
              </p>

              <div className="flex flex-col gap-3 w-full max-w-2xl">
                {STAGES.map((stage, index) => (
                  <button
                    key={stage.id}
                    onClick={() => handleStageClick(stage)}
                    disabled={isLoading}
                    className={`stage-card p-4 flex items-center gap-4 group ${selectedStage === stage.key ? "selected" : ""}`}
                    style={{ animation: `staggerIn 0.5s ${index * 0.05 + 0.1}s ease forwards`, opacity: 0 }}
                  >
                    <div className={`w-11 h-11 rounded-xl ${stage.bg} ${stage.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                      {stage.icon}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <h3 className="font-bold text-slate-800 text-[15px] mb-0.5">{stage.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed truncate">{stage.desc}</p>
                    </div>
                    {selectedStage === stage.key ? (
                      <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white shrink-0">
                        {isLoading ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        )}
                      </div>
                    ) : (
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 text-slate-400/50 text-xs font-medium tracking-wider z-10">
          &copy; 2025 Dawn AI
        </div>
      </div>
    </>
  );
}
