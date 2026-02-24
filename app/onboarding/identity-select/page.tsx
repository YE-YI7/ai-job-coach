"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IdentitySelectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);

  const handleSelect = async (identity: "在校生" | "社招生") => {
    if (isLoading) return;
    
    setSelectedIdentity(identity);
    setIsLoading(true);
    
    try {
      // 保存到 localStorage
      localStorage.setItem("identity", identity);
      
      // 直接跳转，不使用淡出动画避免白屏
      router.push("/onboarding/stage-select");
    } catch (error) {
      console.error("保存身份失败:", error);
      alert("保存失败，请稍后重试");
      setIsLoading(false);
      setSelectedIdentity(null);
    }
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        
        body {
          font-family: 'Inter', 'Noto Sans SC', sans-serif;
          background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 50%, #ffe4e6 100%);
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

        .ambient-light-3 {
          position: absolute;
          top: 40%;
          left: 40%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 60%);
          filter: blur(60px);
          opacity: 0.4;
          pointer-events: none;
          z-index: 0;
          animation: pulse-slow 8s infinite;
        }

        @keyframes float-slow {
          0% { transform: translate(0, 0); }
          100% { transform: translate(30px, 30px); }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-card {
          opacity: 0;
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .identity-card {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 20px 50px -12px rgba(0, 0, 0, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        }

        .identity-card:hover:not(:disabled) {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.95);
          border-color: rgba(0,0,0,0.08);
        }

        .identity-card:active:not(:disabled) {
          transform: translateY(-4px) scale(0.98);
          box-shadow: 0 10px 20px -8px rgba(0, 0, 0, 0.1);
        }

        .identity-card.selected {
          border-color: #f97316;
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.1), 0 20px 40px -12px rgba(249, 115, 22, 0.2);
        }

        .icon-container {
          background: linear-gradient(135deg, #fdfbf7 0%, #f3f0e9 100%);
          transition: all 0.4s ease;
        }

        .identity-card:hover:not(:disabled) .icon-container {
          transform: scale(1.1) rotate(3deg);
          background: linear-gradient(135deg, #fff 0%, #f8f5ee 100%);
        }

        .check-mark {
          transition: opacity 0.3s ease;
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-slate-800 relative">
        {/* 背景光晕元素 */}
        <div className="ambient-light-1"></div>
        <div className="ambient-light-2"></div>
        <div className="ambient-light-3"></div>

        {/* 标题区域 */}
        <div className="text-center mb-16 animate-card z-10" style={{ animationDelay: '0.1s' }}>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-slate-800 tracking-tight">选择你的当前身份</h1>
          <p className="text-slate-500 font-light text-lg">让我们为你量身打造专属的职业规划旅程。</p>
        </div>

        {/* 卡片容器 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl px-4 z-10">
          {/* 卡片 1: 在校生 */}
          <button
            onClick={() => handleSelect("在校生")}
            disabled={isLoading}
            className={`identity-card relative group rounded-3xl p-8 cursor-pointer animate-card h-[420px] flex flex-col items-center text-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedIdentity === "在校生" ? "selected" : ""
            }`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="w-full flex-1 flex items-center justify-center">
              <div className="icon-container w-40 h-40 rounded-2xl shadow-inner flex items-center justify-center mb-6 text-blue-400 relative overflow-hidden border border-slate-100">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent"></div>
                <svg className="w-16 h-16 drop-shadow-sm relative z-10 group-hover:-translate-y-1 transition-transform duration-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                </svg>
                <svg className="absolute bottom-8 right-8 w-6 h-6 text-green-400 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 delay-100" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="w-full">
              <h3 className="text-xl font-bold mb-3 text-slate-800 group-hover:text-orange-600 transition-colors">我是学生</h3>
              <p className="text-sm text-slate-500 leading-relaxed px-4">正在探索职业道路，寻找第一份实习或工作。</p>
            </div>
            {/* 选中标记 */}
            <div 
              className="absolute top-4 right-4 check-mark"
              style={{ opacity: selectedIdentity === "在校生" ? 1 : 0 }}
            >
              <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </button>

          {/* 卡片 2: 社招生 */}
          <button
            onClick={() => handleSelect("社招生")}
            disabled={isLoading}
            className={`identity-card relative group rounded-3xl p-8 cursor-pointer animate-card h-[420px] flex flex-col items-center text-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedIdentity === "社招生" ? "selected" : ""
            }`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="w-full flex-1 flex items-center justify-center">
              <div className="icon-container w-40 h-40 rounded-2xl shadow-inner flex items-center justify-center mb-6 text-amber-600 relative overflow-hidden border border-slate-100">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent"></div>
                <svg className="w-16 h-16 drop-shadow-sm relative z-10 group-hover:-translate-y-1 transition-transform duration-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                  <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
                </svg>
                <svg className="absolute top-8 left-8 w-6 h-6 text-amber-800/40 opacity-0 group-hover:opacity-100 group-hover:rotate-12 transition-all duration-500 delay-100" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5zM15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                </svg>
              </div>
            </div>
            <div className="w-full">
              <h3 className="text-xl font-bold mb-3 text-slate-800 group-hover:text-orange-600 transition-colors">我是职场人</h3>
              <p className="text-sm text-slate-500 leading-relaxed px-4">希望职业进阶、跳槽或转行，寻求新机会。</p>
            </div>
            {/* 选中标记 */}
            <div 
              className="absolute top-4 right-4 check-mark"
              style={{ opacity: selectedIdentity === "社招生" ? 1 : 0 }}
            >
              <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

