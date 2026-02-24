"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import StreamingText from "@/components/StreamingText";
import React from "react";

// Stage 配置类型定义
interface StageConfig {
  id: number;
  title: string;
  desc: string;
  color: string;
  bg: string;
  icon: React.ReactElement;
}

export default function StageSelectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  
  // 客户端认证检查
  useAuth();

  // 阶段数据
  const stages: StageConfig[] = [
    { 
      id: 1, 
      title: "还不清楚要做什么工作", 
      desc: "帮你分析个人优势，定位最适合的赛道。", 
      color: "text-blue-500", 
      bg: "bg-blue-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="12 6 16 14 12 10 8 14 12 6"/></svg>
    },
    { 
      id: 2, 
      title: "有项目经历，但亮点挖不出", 
      desc: "深度拆解项目过程，沉淀可复用的核心能力。", 
      color: "text-indigo-500", 
      bg: "bg-indigo-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    },
    { 
      id: 3, 
      title: "已有简历，但投递没回音", 
      desc: "针对岗位需求精修，让你的简历通过初筛。", 
      color: "text-orange-500", 
      bg: "bg-orange-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    },
    { 
      id: 4, 
      title: "缺少投递渠道，或投递盲目", 
      desc: "制定精准投递计划，提高面试邀请的概率。", 
      color: "text-emerald-500", 
      bg: "bg-emerald-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
    },
    { 
      id: 5, 
      title: "不擅长应对面试", 
      desc: "多方位攻克面试问题，训练成\"面霸\"。", 
      color: "text-cyan-500", 
      bg: "bg-cyan-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    },
    { 
      id: 6, 
      title: "到谈薪环节，但不了解行情", 
      desc: "掌握谈判技巧与薪资水位，争取利益最大化。", 
      color: "text-rose-500", 
      bg: "bg-rose-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    { 
      id: 7, 
      title: "手握多个 Offer，难以抉择", 
      desc: "对比公司前景与福利，做出最理性的判断。", 
      color: "text-purple-500", 
      bg: "bg-purple-50",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
    }
  ];

  // 阶段映射表
  const stagePromptKeyMap: Record<string, string> = {
    "还不清楚要做什么工作": "career_planning",
    "有项目经历，但亮点挖不出": "project_review",
    "已有简历，但投递没回音": "resume_optimization",
    "缺少投递渠道，或投递盲目": "application_strategy",
    "不擅长应对面试": "interview",
    "到谈薪环节，但不了解行情": "salary_talk",
    "手握多个 Offer，难以抉择": "offer"
  };

  // 阶段到路由的映射表
  const STAGE_ROUTER_MAP: Record<string, string> = {
    "还不清楚要做什么工作": "/chat?stage=career",
    "有项目经历，但亮点挖不出": "/chat?stage=review",
    "已有简历，但投递没回音": "/chat/resume-editor",
    "缺少投递渠道，或投递盲目": "/chat?stage=delivery",
    "不擅长应对面试": "/interview/start",
    "到谈薪环节，但不了解行情": "/chat?stage=salary",
    "手握多个 Offer，难以抉择": "/chat?stage=offer"
  };

  // 处理阶段点击
  const handleStageClick = async (stage: StageConfig) => {
    if (isLoading) return;
    
    setSelectedStage(stage.title);
    setIsLoading(true);
    
    try {
      const canonicalKey = stagePromptKeyMap[stage.title] || stage.title;
      
      // 如果是模拟面试，直接跳转
      if (canonicalKey === "interview") {
        localStorage.setItem("current_stage", "interview");
        router.push("/interview/start");
        return;
      }

      // 存储 canonical key
      localStorage.setItem("current_stage", canonicalKey);

      // 获取对应路由
      const route = STAGE_ROUTER_MAP[stage.title] || "/chat";
      
      // 如果是聊天相关路由，尝试获取阶段开场白
      if (route.startsWith("/chat")) {
        try {
          const apiStageMap: Record<string, string> = {
            "career_planning": "career",
            "project_review": "review",
            "resume_optimization": "resume",
            "application_strategy": "delivery",
            "salary_talk": "salary",
            "offer": "offer"
          };
          const apiStage = apiStageMap[canonicalKey] || canonicalKey;
          
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage: apiStage,
              messages: [
                { role: "user", content: "请给我这个阶段的开场白" }
              ]
            })
          });

          const data = await res.json();
          if (data.ok && data.result) {
            localStorage.setItem("stage_intro", data.result);
          }
        } catch (apiErr) {
          console.error("获取阶段开场白失败:", apiErr);
        }
      }

      // 跳转
      router.push(route);
    } catch (err) {
      console.error("阶段初始化失败:", err);
      const canonicalKey = stagePromptKeyMap[stage.title] || stage.title;
      
      if (canonicalKey === "interview") {
        localStorage.setItem("current_stage", "interview");
        router.push("/interview/start");
        return;
      }
      
      const defaultRoute = STAGE_ROUTER_MAP[stage.title] || "/chat";
      router.push(defaultRoute);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+SC:wght@400;500;700&display=swap');
        
        body {
          font-family: 'Inter', 'Noto Sans SC', sans-serif;
          background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 50%, #ffe4e6 100%);
          color: #333;
          overflow-x: hidden;
        }

        .ambient-light-1 {
          position: absolute;
          top: -10%;
          right: -10%;
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(251, 146, 60, 0.15) 0%, rgba(251, 146, 60, 0) 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          animation: float-slow 20s infinite alternate;
        }

        .ambient-light-2 {
          position: absolute;
          bottom: -10%;
          left: -10%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(251, 113, 133, 0.1) 0%, rgba(251, 113, 133, 0) 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          animation: float-slow 15s infinite alternate-reverse;
        }

        @keyframes float-slow {
          0% { transform: translate(0, 0); }
          100% { transform: translate(30px, 30px); }
        }

        .stage-card {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 16px;
          box-shadow: 
            0 4px 6px -1px rgba(0, 0, 0, 0.1), 
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            inset 0 2px 4px rgba(255, 255, 255, 0.5);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          cursor: pointer;
          border: 2px solid transparent;
        }

        .stage-card:hover:not(:disabled) {
          transform: translateY(-8px) scale(1.03);
          box-shadow: 
            0 20px 25px -5px rgba(0, 0, 0, 0.1), 
            0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border-color: #f97316;
        }

        .stage-card.selected {
          border-color: #f97316;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .stage-card:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col relative overflow-hidden">
        {/* 背景光晕元素 */}
        <div className="ambient-light-1"></div>
        <div className="ambient-light-2"></div>

        {/* 顶部标题区域 - 使用流式输出 */}
        <div className="pt-16 px-12 z-20 flex flex-col items-center w-full">
          {/* 主标题 */}
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-4">
            告诉我，你现在最大的求职困扰是什么？
          </h1>
          
          {/* 副标题/引导语 - 流式输出 */}
          <div className="text-center max-w-3xl">
            <StreamingText 
              text="别担心，无论处于哪个阶段，我都会陪你一起攻克。选择一个最符合你当下状态的问题，我们立刻开始。"
              className="text-lg text-slate-600 font-medium leading-relaxed"
              speed={50}
            />
          </div>
        </div>

        {/* 阶段卡片 - 线性布局 */}
        <div className="flex-1 flex items-center justify-center px-8 py-12 z-10 w-full">
          <div className="flex flex-col gap-4 max-w-4xl w-full">
            {stages.map((stage, index) => (
              <button
                key={stage.id}
                onClick={() => handleStageClick(stage)}
                disabled={isLoading}
                className={`stage-card p-5 flex items-center gap-4 group ${
                  selectedStage === stage.title ? "selected" : ""
                }`}
                style={{ 
                  animationDelay: `${index * 0.05}s`,
                  animation: 'fadeInUp 0.6s ease-out forwards',
                  opacity: 0
                }}
              >
                {/* 图标 */}
                <div className={`w-14 h-14 rounded-xl ${stage.bg} ${stage.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform flex-shrink-0`}>
                  {stage.icon}
                </div>
                
                {/* 文字内容 */}
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-slate-800 text-lg mb-1">{stage.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{stage.desc}</p>
                </div>
                
                {/* 箭头或选中标记 */}
                {selectedStage === stage.title ? (
                  <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
