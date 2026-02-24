"use client";

import RegisterForm from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        
        body {
          font-family: 'Inter', 'Noto Sans SC', sans-serif;
          background-color: #fffbeb;
          overflow: hidden;
        }

        .gradient-bg-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: linear-gradient(40deg, #fffbeb, #fff7ed);
          z-index: 0;
        }

        .svg-filter {
          position: absolute;
          width: 0;
          height: 0;
        }

        .gradients-container {
          width: 100%;
          height: 100%;
          filter: url(#goo) blur(40px);
        }

        .g-blob {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--size);
          height: var(--size);
          background: radial-gradient(circle at center, var(--color) 0%, rgba(255,255,255,0) 50%);
          mix-blend-mode: var(--blending);
          transform-origin: center center;
          opacity: 1;
          will-change: transform, opacity;
        }

        :root {
          --size: 800px;
          --blending: hard-light;
          --color1: 255, 107, 74;
          --color2: 251, 146, 60;
          --color3: 251, 113, 133;
          --color4: 244, 114, 182;
          --color5: 254, 202, 202;
        }

        @keyframes moveVertical {
          0% { transform: translateY(-50%) translateX(-50%); }
          50% { transform: translateY(-40%) translateX(-50%); }
          100% { transform: translateY(-50%) translateX(-50%); }
        }

        @keyframes moveInCircle {
          0% { transform: rotate(0deg) translateX(100px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(100px) rotate(-360deg); }
        }

        @keyframes moveHorizontal {
          0% { transform: translateX(-50%) translateY(-10%); }
          50% { transform: translateX(50%) translateY(10%); }
          100% { transform: translateX(-50%) translateY(-10%); }
        }

        .g1 {
          --color: rgba(var(--color1), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          animation: moveVertical 18s ease infinite;
        }

        .g2 {
          --color: rgba(var(--color2), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          transform-origin: calc(50% - 400px);
          animation: moveInCircle 12s reverse infinite;
        }

        .g3 {
          --color: rgba(var(--color3), 0.8);
          top: calc(50% - var(--size)/2 + 200px);
          left: calc(50% - var(--size)/2 - 500px);
          transform-origin: calc(50% + 400px);
          animation: moveInCircle 24s linear infinite;
        }

        .g4 {
          --color: rgba(var(--color4), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          transform-origin: calc(50% - 200px);
          animation: moveHorizontal 24s ease infinite;
          opacity: 0.7;
        }

        .g5 {
          --color: rgba(var(--color5), 0.8);
          width: calc(var(--size) * 2);
          height: calc(var(--size) * 2);
          top: calc(50% - var(--size));
          left: calc(50% - var(--size));
          transform-origin: calc(50% - 800px) calc(50% + 800px);
          animation: moveInCircle 12s ease infinite;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 20px 50px -12px rgba(0, 0, 0, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fadeIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center text-slate-800 overflow-hidden relative p-4">
        {/* Dynamic Gradient Background */}
        <div className="gradient-bg-container">
          <svg className="svg-filter">
            <defs>
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
                <feBlend in="SourceGraphic" in2="goo" />
              </filter>
            </defs>
          </svg>
          <div className="gradients-container">
            <div className="g-blob g1"></div>
            <div className="g-blob g2"></div>
            <div className="g-blob g3"></div>
            <div className="g-blob g4"></div>
            <div className="g-blob g5"></div>
          </div>
        </div>

        {/* Register Card */}
        <div className="w-full max-w-lg p-10 rounded-3xl glass-card animate-fade-in z-10 relative">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src="/logo.png" alt="益职 AI Logo" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">益职 AI</h1>
            <p className="text-slate-500 text-sm font-medium">请填写以下信息，让我们更好地为您服务</p>
          </div>
          <RegisterForm />
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 text-slate-400/60 text-xs font-medium tracking-wider z-10">
          &copy; 2024 Dawn AI. 版权所有.
        </div>
      </div>
    </>
  );
}

